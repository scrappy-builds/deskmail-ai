import { BrowserWindow } from 'electron'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { MessageDetail } from '@shared/db'

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

// One message's header block + body, for embedding in a print document.
function messageBlock(m: MessageDetail): string {
  const body = m.bodyHtml ?? (m.bodyText ? `<pre style="white-space:pre-wrap;font:inherit">${esc(m.bodyText)}</pre>` : '')
  return `<div class="hdr">
      <h1>${esc(m.subject || '(no subject)')}</h1>
      <div class="meta">From: ${esc(m.fromName || m.fromEmail || '')}<br>To: ${esc(m.to.join(', '))}<br>${esc(m.receivedAt ?? '')}</div>
    </div>${body}`
}

// A self-contained print document for one or more messages (a whole conversation
// is several blocks separated by a rule). The body is the already-sanitised
// stored HTML (or the plain text), rendered in a window with JavaScript disabled
// — so printing can't execute anything.
function printHtml(messages: MessageDetail[]): string {
  const blocks = messages.map(messageBlock).join('<hr class="sep">')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;line-height:1.5;padding:36px;max-width:720px;margin:0 auto}
    .hdr{border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:18px}
    h1{font-size:20px;margin:0 0 10px}
    .meta{font-size:12px;color:#555;line-height:1.6}
    .sep{border:0;border-top:2px solid #ccc;margin:32px 0}
    img{max-width:100%}
  </style></head><body>${blocks}</body></html>`
}

// Render an ordered list of messages into a single PDF at savePath. Uses an
// offscreen, JS-disabled window and printToPDF. ponytail: renders the stored
// HTML directly; no pagination tuning until someone needs precise page breaks.
export async function printMessagesToPdf(userDataDir: string, messages: MessageDetail[], savePath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const tmp = join(userDataDir, `.print-${Date.now()}.html`)
  writeFileSync(tmp, printHtml(messages), 'utf-8')
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    writeFileSync(savePath, pdf)
  } finally {
    win.destroy()
    try {
      unlinkSync(tmp)
    } catch {
      /* temp already gone */
    }
  }
}

// Render a single message to a PDF (thin wrapper over the multi-message form).
export async function printMessageToPdf(userDataDir: string, m: MessageDetail, savePath: string): Promise<void> {
  return printMessagesToPdf(userDataDir, [m], savePath)
}
