import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { getMessage, listAttachmentRows } from '../db/messages'
import type { DB } from '../db/database'

export interface ExportResult {
  folder: string
  files: { name: string; path: string }[]
  note?: string
}

function slug(s: string | null): string {
  return (s ?? 'email').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50).toLowerCase() || 'email'
}

// Export one email (and, optionally, its already-downloaded attachments) into a
// self-contained folder for NotebookLM to ingest as sources. Pure fs + DB — no
// IMAP and no Electron — so it runs in both the app and the standalone MCP server.
// (The in-app action downloads attachments first so they're available here.)
export function exportForNotebookLM(db: DB, messageId: number, baseDir: string, includeAttachments: boolean): ExportResult {
  const m = getMessage(db, messageId)
  if (!m) throw new Error('Message not found')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const folder = join(baseDir, 'notebooklm-export', `${stamp}-${slug(m.subject)}`)
  mkdirSync(folder, { recursive: true })

  const body = m.bodyText ?? (m.bodyHtml ? m.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
  const emailText =
    `Subject: ${m.subject ?? ''}\n` +
    `From: ${m.fromName ?? ''} <${m.fromEmail ?? ''}>\n` +
    `To: ${m.to.join(', ')}\n` +
    `Date: ${m.receivedAt ?? ''}\n\n` +
    body
  const emailPath = join(folder, 'email.txt')
  writeFileSync(emailPath, emailText, 'utf-8')

  const files = [{ name: 'email.txt', path: emailPath }]
  let note: string | undefined

  if (includeAttachments) {
    let missing = 0
    for (const a of listAttachmentRows(db, messageId)) {
      if (a.local_path && existsSync(a.local_path)) {
        const name = a.filename ?? basename(a.local_path)
        const dest = join(folder, name)
        copyFileSync(a.local_path, dest)
        files.push({ name, path: dest })
      } else {
        missing++
      }
    }
    if (missing > 0) {
      note = `${missing} attachment(s) weren't downloaded yet — use "Send to NotebookLM" in DeskMail (it fetches them first) to include them.`
    }
  }

  return { folder, files, note }
}
