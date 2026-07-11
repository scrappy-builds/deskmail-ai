import { readFileSync, unlinkSync } from 'node:fs'
import type { ImapFlow } from 'imapflow'
import type { DB } from '../../db/database'
import { markActionDone, markActionError, pendingActions, type QueuedAction } from '../../db/mailActions'
import { withConnection } from './connectionPool'

// Push one queued action to the server.
async function applyRemote(client: ImapFlow, a: QueuedAction): Promise<void> {
  // 'append' rows carry a spool file (source_path) and a mailbox (target_path),
  // not a message UID — replay the Sent-folder copy that failed at send time.
  if (a.op === 'append') {
    if (!a.source_path || !a.target_path) return
    const raw = readFileSync(a.source_path)
    try {
      await client.mailboxCreate(a.target_path)
    } catch {
      /* already exists */
    }
    await client.append(a.target_path, raw, ['\\Seen'])
    try {
      unlinkSync(a.source_path)
    } catch {
      /* spool file already gone */
    }
    return
  }
  // Empty a folder: expunge every message in the mailbox in one go. Immune to
  // stale per-message UIDs (a message moved into Trash keeps its old UID locally).
  if (a.op === 'empty') {
    if (!a.source_path) return
    // Force a fresh SELECT so the count reflects mail moved in this same batch and
    // isn't stale from the kept-alive connection.
    const open = client.mailbox
    if (open && typeof open !== 'boolean' && open.path === a.source_path) await client.mailboxClose()
    const lock = await client.getMailboxLock(a.source_path)
    try {
      const mb = client.mailbox
      if (mb && typeof mb !== 'boolean' && mb.exists > 0) {
        await client.messageDelete('1:*', { uid: true }) // mark \Deleted + expunge all
      }
    } finally {
      lock.release()
    }
    return
  }

  if (!a.source_path || a.remote_uid == null) return // local-only message; nothing to replay
  const uid = String(a.remote_uid)
  const lock = await client.getMailboxLock(a.source_path)
  try {
    switch (a.op) {
      case 'flag':
        await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true })
        break
      case 'unflag':
        await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true })
        break
      case 'read':
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
        break
      case 'unread':
        await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true })
        break
      case 'delete-forever':
        // Flag \Deleted and expunge on the server (permanent).
        await client.messageDelete(uid, { uid: true })
        break
      default: // move | trash | junk | archive
        if (a.target_path) {
          try {
            await client.mailboxCreate(a.target_path)
          } catch {
            /* already exists */
          }
          await client.messageMove(uid, a.target_path, { uid: true })
        }
    }
  } finally {
    lock.release()
  }
}

// Drain the queued mail actions to IMAP. Connection failures leave rows pending
// (retried next cycle, so offline changes reconcile later); a failed op is marked
// 'error' so it doesn't loop forever. Never throws — safe to fire-and-forget.
// Returns how many rows were resolved (done or error) this cycle.
export async function drainMailActions(db: DB): Promise<number> {
  const pending = pendingActions(db)
  if (pending.length === 0) return 0
  let resolved = 0

  const byAccount = new Map<number, QueuedAction[]>()
  for (const a of pending) {
    const list = byAccount.get(a.account_id) ?? []
    list.push(a)
    byAccount.set(a.account_id, list)
  }

  for (const [accountId, actions] of byAccount) {
    // Track per-action completion so the pool's reconnect-and-retry of the whole
    // batch never re-applies an op that already resolved.
    const settled = new Set<number>()
    try {
      await withConnection(db, accountId, async (client) => {
        for (const a of actions) {
          if (settled.has(a.id)) continue
          try {
            await applyRemote(client, a)
            markActionDone(db, a.id)
          } catch (err) {
            if (!client.usable) throw err // socket died — leave pending, pool may retry
            markActionError(db, a.id, (err as Error).message ?? 'IMAP op failed')
          }
          settled.add(a.id)
          resolved++
        }
      })
    } catch {
      // Connection failed — leave this account's remaining actions pending.
    }
  }
  return resolved
}
