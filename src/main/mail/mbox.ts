import { readFileSync, writeFileSync } from 'node:fs'
import type { DB } from '../../db/database'
import { folderMessageIds, getMessage } from '../../db/messages'
import { getFolder } from '../../db/folders'
import { refreshFolderCounts } from '../../db/folders'
import { ingestRaw } from './ingest'
import { buildEml } from './messageExport'

// Split an mbox blob into individual raw RFC822 messages. Each message starts on
// a line beginning "From " (the mbox separator); we drop that separator line.
export function splitMbox(raw: string): string[] {
  return raw
    .split(/\r?\n(?=From )/g)
    .map((p) => p.replace(/^From [^\n]*\r?\n/, '').trim())
    .filter((p) => p.length > 0)
}

// Import an .mbox (many messages) or a single .eml into a folder as local mail.
export async function importMailFile(db: DB, folderId: number, filePath: string, kind: 'mbox' | 'eml'): Promise<number> {
  const folder = getFolder(db, folderId)
  if (!folder) return 0
  const meta = { accountId: folder.account_id, folderId, remoteUid: null, isRead: true, isStarred: false }
  let count = 0
  if (kind === 'eml') {
    await ingestRaw(db, meta, readFileSync(filePath))
    count = 1
  } else {
    for (const raw of splitMbox(readFileSync(filePath, 'utf-8'))) {
      await ingestRaw(db, meta, raw)
      count++
    }
  }
  refreshFolderCounts(db, folderId)
  return count
}

// Export every message in a folder as a single .mbox file.
export function exportMbox(db: DB, folderId: number, filePath: string): number {
  const chunks: string[] = []
  for (const id of folderMessageIds(db, folderId)) {
    const m = getMessage(db, id)
    if (!m) continue
    const from = m.fromEmail || 'unknown@localhost'
    const date = m.receivedAt ? new Date(m.receivedAt).toUTCString() : new Date().toUTCString()
    chunks.push(`From ${from} ${date}\r\n${buildEml(m)}`)
  }
  writeFileSync(filePath, chunks.join('\r\n\r\n'), 'utf-8')
  return chunks.length
}
