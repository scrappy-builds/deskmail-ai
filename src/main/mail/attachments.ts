import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { simpleParser } from 'mailparser'
import type { AccountRow } from '@shared/db'
import { getFolder } from '../../db/folders'
import { getMessageMeta, listAttachmentRows, setAttachmentPath } from '../../db/messages'
import { getCredential } from '../credentials'
import { buildImapClient } from './imapClient'
import type { DB } from '../../db/database'

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

// Download a message's attachments from IMAP into destDir and record their paths.
// Best-effort: returns the saved files, or [] if the account is unreachable or has
// no attachments. Never throws for the common "can't connect" case.
export async function fetchAndSaveAttachments(db: DB, messageId: number, destDir: string): Promise<{ id: number; filename: string; path: string }[]> {
  const meta = getMessageMeta(db, messageId)
  if (!meta || meta.remoteUid == null || meta.folderId == null) return []
  const rows = listAttachmentRows(db, messageId)
  if (rows.length === 0) return []

  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [meta.accountId]) as unknown as AccountRow | undefined
  const password = getCredential(db, meta.accountId)
  const source = getFolder(db, meta.folderId)
  if (!acc || acc.incoming_type !== 'imap' || !password || !source?.remote_path) return []

  const client = buildImapClient(acc, password)
  const saved: { id: number; filename: string; path: string }[] = []
  try {
    await client.connect()
    const lock = await client.getMailboxLock(source.remote_path)
    try {
      const msg = await client.fetchOne(String(meta.remoteUid), { source: true }, { uid: true })
      if (!msg || !msg.source) return []
      const parsed = await simpleParser(msg.source)
      mkdirSync(destDir, { recursive: true })
      const atts = parsed.attachments ?? []
      for (let i = 0; i < atts.length; i++) {
        const att = atts[i]
        if (!att.content) continue
        const filename = safeName(att.filename ?? `attachment-${i + 1}`)
        const path = join(destDir, filename)
        writeFileSync(path, att.content)
        // Match to a stored attachment row by filename (best-effort) to record the path.
        const row = rows.find((r) => (r.filename ?? '') === (att.filename ?? '')) ?? rows[i]
        if (row) setAttachmentPath(db, row.id, path)
        saved.push({ id: row?.id ?? -1, filename, path })
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch {
    try {
      await client.close()
    } catch {
      /* already down */
    }
  }
  return saved
}
