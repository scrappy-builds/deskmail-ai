import type { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { markActionDone, markActionError, pendingActions, type QueuedAction } from '../../db/mailActions'
import { getCredential } from '../credentials'
import { buildImapClient } from './imapClient'

// Push one queued action to the server.
async function applyRemote(client: ImapFlow, a: QueuedAction): Promise<void> {
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
    const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
    const password = getCredential(db, accountId)
    if (!acc || acc.incoming_type !== 'imap' || !password) continue // can't reach server → leave pending

    const client = buildImapClient(acc, password)
    try {
      await client.connect()
      for (const a of actions) {
        try {
          await applyRemote(client, a)
          markActionDone(db, a.id)
        } catch (err) {
          markActionError(db, a.id, (err as Error).message ?? 'IMAP op failed')
        }
        resolved++
      }
      await client.logout()
    } catch {
      try {
        await client.close()
      } catch {
        /* already down */
      }
      // Connection failed — leave this account's actions pending for a later cycle.
    }
  }
  return resolved
}
