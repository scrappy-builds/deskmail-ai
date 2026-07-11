import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { simpleParser } from 'mailparser'
import { getFolder } from '../../db/folders'
import { getMessageMeta, listAttachmentRows, setAttachmentPath } from '../../db/messages'
import { withConnection } from './connectionPool'
import type { DB } from '../../db/database'

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

// --- Attachment cache limit ----------------------------------------------------
// Downloaded attachment files are a cache: metadata rows persist and files are
// re-downloadable from IMAP, so capping the folder is safe. Evicts oldest
// download first until under budget. maxBytes <= 0 means unlimited (still tidies
// rows whose files vanished). `protect` = message ids currently open in windows.
export function sweepAttachmentCache(db: DB, maxBytes: number, protect: Set<number> = new Set()): { evicted: number; bytesUsed: number } {
  const rows = db.all(
    'SELECT id, message_id, local_path FROM attachments WHERE local_path IS NOT NULL ORDER BY downloaded_at ASC, id ASC'
  ) as unknown as { id: number; message_id: number; local_path: string }[]

  const entries: { id: number; messageId: number; path: string; size: number }[] = []
  let total = 0
  for (const r of rows) {
    try {
      const size = statSync(r.local_path).size
      entries.push({ id: r.id, messageId: r.message_id, path: r.local_path, size })
      total += size
    } catch {
      // File already gone (user tidied the folder) — just clear the row.
      db.run('UPDATE attachments SET local_path = NULL, downloaded_at = NULL WHERE id = ?', [r.id])
    }
  }

  let evicted = 0
  if (maxBytes > 0) {
    for (const e of entries) {
      if (total <= maxBytes) break
      if (protect.has(e.messageId)) continue
      try {
        unlinkSync(e.path)
      } catch {
        /* locked or already gone — the row is cleared either way */
      }
      db.run('UPDATE attachments SET local_path = NULL, downloaded_at = NULL WHERE id = ?', [e.id])
      total -= e.size
      evicted++
    }
  }
  return { evicted, bytesUsed: total }
}

// Download a message's attachments from IMAP into destDir and record their paths.
// Best-effort: returns the saved files, or [] if the account is unreachable or has
// no attachments. Never throws for the common "can't connect" case.
export async function fetchAndSaveAttachments(db: DB, messageId: number, destDir: string): Promise<{ id: number; filename: string; path: string }[]> {
  const meta = getMessageMeta(db, messageId)
  if (!meta || meta.remoteUid == null || meta.folderId == null) return []
  const rows = listAttachmentRows(db, messageId)
  if (rows.length === 0) return []

  const source = getFolder(db, meta.folderId)
  if (!source?.remote_path) return []

  const saved: { id: number; filename: string; path: string }[] = []
  try {
    await withConnection(db, meta.accountId, async (client) => {
      const lock = await client.getMailboxLock(source.remote_path!)
      try {
        const msg = await client.fetchOne(String(meta.remoteUid), { source: true }, { uid: true })
        if (!msg || !msg.source) return
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
    })
  } catch {
    /* unreachable server — best-effort, return what we have */
  }
  return saved
}
