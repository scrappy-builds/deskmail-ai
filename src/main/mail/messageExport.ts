import { writeFileSync } from 'node:fs'
import type { MessageDetail } from '@shared/db'
import type { DB } from '../../db/database'
import { getMessage } from '../../db/messages'

function addr(name: string | null, email: string | null): string {
  if (email && name) return `"${name}" <${email}>`
  return email || name || ''
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Reconstruct a simple RFC822 .eml from what we cached (we don't keep the raw
// message). Good enough for "View source" and a portable .eml export.
export function buildEml(m: MessageDetail): string {
  const headers = [
    `From: ${addr(m.fromName, m.fromEmail)}`,
    `To: ${m.to.join(', ')}`,
    m.cc.length ? `Cc: ${m.cc.join(', ')}` : null,
    `Subject: ${m.subject ?? ''}`,
    m.receivedAt ? `Date: ${new Date(m.receivedAt).toUTCString()}` : null,
    m.importance && m.importance !== 'normal' ? `Importance: ${m.importance}` : null,
    'MIME-Version: 1.0',
    `Content-Type: text/${m.bodyHtml ? 'html' : 'plain'}; charset=utf-8`
  ].filter(Boolean) as string[]
  return `${headers.join('\r\n')}\r\n\r\n${m.bodyHtml ?? m.bodyText ?? ''}`
}

// A self-contained HTML document of the message (for Save as .html).
export function buildStandaloneHtml(m: MessageDetail): string {
  const head = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.subject ?? 'message')}</title></head>`
  const meta = `<p style="color:#666;font:13px sans-serif"><b>${esc(m.fromName || m.fromEmail || '')}</b><br>To: ${esc(m.to.join(', '))}<br>${m.receivedAt ? esc(new Date(m.receivedAt).toLocaleString()) : ''}</p><hr>`
  return `${head}<body>${meta}${m.bodyHtml ?? `<pre>${esc(m.bodyText ?? '')}</pre>`}</body></html>`
}

export function saveMessageFile(m: MessageDetail, path: string, format: 'eml' | 'html'): void {
  writeFileSync(path, format === 'eml' ? buildEml(m) : buildStandaloneHtml(m), 'utf-8')
}

// Normalise a subject for conversation grouping — strip repeated Re:/Fwd:
// prefixes, collapse whitespace, lowercase. Mirrors the renderer's threading.
function normSubject(s: string | null): string {
  let out = (s ?? '').trim()
  let prev
  do {
    prev = out
    out = out.replace(/^(re|fwd?|fw)\s*:\s*/i, '')
  } while (out !== prev)
  return out.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Gather the whole conversation for a message: every message in the same folder
// with the same normalised subject, oldest first. Falls back to just the one
// message (e.g. no subject, or nothing else matches).
export function gatherThread(db: DB, id: number): MessageDetail[] {
  const m = getMessage(db, id)
  if (!m) return []
  const key = normSubject(m.subject)
  if (!key || m.folderId == null) return [m]
  const rows = db.all(
    'SELECT id, subject, received_at FROM messages WHERE folder_id = ?',
    [m.folderId]
  ) as unknown as { id: number; subject: string | null; received_at: string | null }[]
  const ordered = rows
    .filter((r) => normSubject(r.subject) === key)
    .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? '') || a.id - b.id)
    .map((r) => getMessage(db, r.id))
    .filter((x): x is MessageDetail => x != null)
  return ordered.length ? ordered : [m]
}

// A self-contained HTML document of a whole conversation (each message's header
// + body, separated by a rule). Single-message threads render like Save as .html.
export function buildThreadHtml(messages: MessageDetail[]): string {
  const title = esc(messages[0]?.subject ?? 'conversation')
  const head = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>`
  const parts = messages
    .map((m) => {
      const meta = `<p style="color:#666;font:13px sans-serif"><b>${esc(m.fromName || m.fromEmail || '')}</b><br>To: ${esc(m.to.join(', '))}<br>${m.receivedAt ? esc(new Date(m.receivedAt).toLocaleString()) : ''}</p><hr>`
      return `${meta}${m.bodyHtml ?? `<pre>${esc(m.bodyText ?? '')}</pre>`}`
    })
    .join('<hr style="border:0;border-top:2px solid #ccc;margin:32px 0">')
  return `${head}<body>${parts}</body></html>`
}

export function saveThreadFile(messages: MessageDetail[], path: string): void {
  writeFileSync(path, buildThreadHtml(messages), 'utf-8')
}
