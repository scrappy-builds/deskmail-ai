import { writeFileSync } from 'node:fs'
import type { MessageDetail } from '@shared/db'

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
