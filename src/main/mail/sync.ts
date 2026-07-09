import { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { refreshFolderCounts, upsertFolder } from '../../db/folders'
import { ingestRaw } from './ingest'

// How many recent messages to pull per synced folder. Keeps first sync quick.
const RECENT = 50

// Guess a folder's role from IMAP special-use flags or its name.
function folderRole(path: string, specialUse?: string): string | null {
  const su = specialUse?.replace('\\', '').toLowerCase()
  if (su) return su // 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | ...
  const p = path.toLowerCase()
  if (p === 'inbox') return 'inbox'
  return null
}

export type SyncResult = { ok: true } | { ok: false; error: string }

// Sync one account: refresh the folder list, then pull recent messages from the
// inbox into the local cache. Runs in the main process, off the UI thread.
export async function syncAccount(db: DB, accountId: number): Promise<SyncResult> {
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
  if (!acc) return { ok: false, error: 'Account not found.' }
  if (acc.incoming_type !== 'imap') {
    // ponytail: POP3 sync is optional (Stage 5 note) — IMAP first.
    return { ok: false, error: 'Only IMAP sync is supported so far.' }
  }

  const password = getCredential(db, accountId)
  if (!password) return { ok: false, error: 'No stored password for this account.' }

  const client = new ImapFlow({
    host: acc.incoming_host,
    port: acc.incoming_port,
    secure: acc.incoming_security === 'ssl',
    auth: { user: acc.username, pass: password },
    logger: false
  })

  try {
    await client.connect()

    // Folder list.
    let inboxId: number | null = null
    for (const box of await client.list()) {
      const id = upsertFolder(db, accountId, box.name, folderRole(box.path, box.specialUse), box.path)
      if (box.path.toLowerCase() === 'inbox') inboxId = id
    }

    // Recent messages from the inbox.
    if (inboxId != null) {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const total = client.mailbox && typeof client.mailbox !== 'boolean' ? client.mailbox.exists : 0
        if (total > 0) {
          const start = Math.max(1, total - (RECENT - 1))
          for await (const msg of client.fetch(`${start}:*`, { uid: true, flags: true, source: true })) {
            if (!msg.source) continue
            await ingestRaw(
              db,
              {
                accountId,
                folderId: inboxId,
                remoteUid: msg.uid,
                isRead: msg.flags?.has('\\Seen') ?? false,
                isStarred: msg.flags?.has('\\Flagged') ?? false
              },
              msg.source
            )
          }
        }
        refreshFolderCounts(db, inboxId)
      } finally {
        lock.release()
      }
    }

    await client.logout()
    recordSyncState(db, accountId, inboxId, 'ok', null)
    return { ok: true }
  } catch (err) {
    try {
      await client.close()
    } catch {
      /* already down */
    }
    const error = (err as Error).message ?? 'Sync failed.'
    recordSyncState(db, accountId, null, 'error', error)
    return { ok: false, error }
  }
}

function recordSyncState(db: DB, accountId: number, folderId: number | null, status: string, error: string | null): void {
  db.run(
    `INSERT INTO sync_state (account_id, folder_id, last_sync_at, sync_status, sync_error)
     VALUES (?, ?, datetime('now'), ?, ?)`,
    [accountId, folderId, status, error]
  )
}

export async function syncAllAccounts(db: DB): Promise<void> {
  const rows = db.all("SELECT id FROM accounts WHERE incoming_type = 'imap'") as unknown as { id: number }[]
  for (const r of rows) await syncAccount(db, r.id)
}
