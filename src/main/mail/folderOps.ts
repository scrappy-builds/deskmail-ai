import { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'

// Push a local folder change (create/rename/delete) to the IMAP server so that
// moving mail into a custom folder actually lands somewhere server-side.
// ponytail: best-effort — a failure just logs; the local folder still works and
// the next successful sync reconciles. No queue/retry until it proves necessary.
async function withImap(db: DB, accountId: number, fn: (c: ImapFlow) => Promise<unknown>): Promise<void> {
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
  if (!acc || acc.incoming_type !== 'imap') return
  const password = getCredential(db, accountId)
  if (!password) return
  const client = new ImapFlow({
    host: acc.incoming_host,
    port: acc.incoming_port,
    secure: acc.incoming_security === 'ssl',
    auth: { user: acc.username, pass: password },
    logger: false
  })
  try {
    await client.connect()
    await fn(client)
    await client.logout()
  } catch (err) {
    try {
      await client.close()
    } catch {
      /* already down */
    }
    console.error('IMAP folder op failed:', (err as Error).message)
  }
}

export function imapCreateFolder(db: DB, accountId: number, path: string): Promise<void> {
  return withImap(db, accountId, (c) => c.mailboxCreate(path).catch(() => undefined))
}
export function imapRenameFolder(db: DB, accountId: number, from: string, to: string): Promise<void> {
  return withImap(db, accountId, (c) => c.mailboxRename(from, to).catch(() => undefined))
}
export function imapDeleteFolder(db: DB, accountId: number, path: string): Promise<void> {
  return withImap(db, accountId, (c) => c.mailboxDelete(path).catch(() => undefined))
}
