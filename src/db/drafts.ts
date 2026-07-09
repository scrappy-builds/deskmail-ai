import type { ComposePayload, DraftSummary } from '@shared/db'
import type { DB } from './database'

function parseArr(s: string | null): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Insert or update a draft. Returns the draft id. created_by defaults to 'user'
// (Claude-created drafts set it to 'claude' via the MCP layer in Stage 9).
export function saveDraft(db: DB, p: ComposePayload, createdBy: 'user' | 'claude' = 'user'): number {
  if (p.draftId != null) {
    db.run(
      `UPDATE drafts SET account_id = ?, to_json = ?, cc_json = ?, bcc_json = ?, subject = ?, body = ?,
         in_reply_to_message_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [p.accountId, JSON.stringify(p.to), JSON.stringify(p.cc), JSON.stringify(p.bcc), p.subject, p.bodyHtml, p.inReplyToMessageId ?? null, p.draftId]
    )
    return p.draftId
  }
  db.run(
    `INSERT INTO drafts (account_id, to_json, cc_json, bcc_json, subject, body, created_by, in_reply_to_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.accountId, JSON.stringify(p.to), JSON.stringify(p.cc), JSON.stringify(p.bcc), p.subject, p.bodyHtml, createdBy, p.inReplyToMessageId ?? null]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

interface DraftRow {
  id: number
  account_id: number | null
  to_json: string | null
  cc_json: string | null
  bcc_json: string | null
  subject: string | null
  body: string | null
  created_by: string
  updated_at: string
}

function toSummary(r: DraftRow): DraftSummary {
  return {
    id: r.id,
    accountId: r.account_id,
    to: parseArr(r.to_json),
    cc: parseArr(r.cc_json),
    bcc: parseArr(r.bcc_json),
    subject: r.subject,
    bodyHtml: r.body,
    createdBy: r.created_by ?? 'user',
    updatedAt: r.updated_at
  }
}

export function listDrafts(db: DB): DraftSummary[] {
  const rows = db.all('SELECT * FROM drafts ORDER BY updated_at DESC, id DESC') as unknown as DraftRow[]
  return rows.map(toSummary)
}

export function getDraft(db: DB, id: number): DraftSummary | null {
  const r = db.get('SELECT * FROM drafts WHERE id = ?', [id]) as unknown as DraftRow | undefined
  return r ? toSummary(r) : null
}

export function deleteDraft(db: DB, id: number): void {
  db.run('DELETE FROM drafts WHERE id = ?', [id])
}
