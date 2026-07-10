import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { ensureRoleFolder, refreshFolderCounts } from '../../db/folders'
import { queueAppend } from '../../db/mailActions'
import { buildImapClient } from './imapClient'
import { ingestRaw } from './ingest'

// After a successful SMTP send, keep a copy: ingest into the local Sent folder
// immediately (visible without waiting for a sync), then APPEND to the account's
// IMAP Sent mailbox. The send has already succeeded, so this never throws — an
// IMAP failure spools the raw message and queues a retry through mail_actions.
export async function appendToSent(
  db: DB,
  accountId: number,
  raw: Buffer,
  spoolDir: string,
  makeClient: (acc: AccountRow, password: string) => ImapFlow = buildImapClient
): Promise<void> {
  const sent = ensureRoleFolder(db, accountId, 'sent', 'Sent')
  const sentPath = sent.remote_path ?? 'Sent'

  try {
    await ingestRaw(db, { accountId, folderId: sent.id, remoteUid: null, isRead: true, isStarred: false }, raw)
    refreshFolderCounts(db, sent.id)
  } catch {
    /* unparseable output from our own composer would be a bug, but never block */
  }

  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
  const password = getCredential(db, accountId)
  if (!acc || acc.incoming_type !== 'imap' || !password) return

  const client = makeClient(acc, password)
  try {
    await client.connect()
    try {
      await client.mailboxCreate(sentPath)
    } catch {
      /* already exists */
    }
    await client.append(sentPath, raw, ['\\Seen'])
    await client.logout()
  } catch {
    try {
      await client.close()
    } catch {
      /* already down */
    }
    // Spool the raw message; the action drainer replays the APPEND later.
    try {
      mkdirSync(spoolDir, { recursive: true })
      const path = join(spoolDir, `sent-${accountId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.eml`)
      writeFileSync(path, raw)
      queueAppend(db, accountId, path, sentPath)
    } catch {
      /* spool dir unwritable — the local copy above still exists */
    }
  }
}
