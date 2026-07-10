import type { ComposePayload, ScheduledSend } from '@shared/db'
import { saveDraft, deleteDraft, getDraft } from './drafts'
import type { DB } from './database'

// A scheduled send = a stored draft + a scheduled_sends row. Used for both
// "Send later" and undo-send (undo-send just schedules a few seconds out).

export function scheduleSend(db: DB, payload: ComposePayload, sendAtIso: string): { id: number; draftId: number } {
  const draftId = saveDraft(db, payload)
  db.run(
    "INSERT INTO scheduled_sends (draft_id, account_id, send_at, status) VALUES (?, ?, ?, 'scheduled')",
    [draftId, payload.accountId, sendAtIso]
  )
  const id = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  return { id, draftId }
}

interface Row {
  id: number
  draft_id: number | null
  account_id: number | null
  send_at: string
  status: string
}

function toScheduled(db: DB, r: Row): ScheduledSend {
  const draft = r.draft_id != null ? getDraft(db, r.draft_id) : null
  return {
    id: r.id,
    draftId: r.draft_id,
    accountId: r.account_id,
    sendAt: r.send_at,
    status: r.status,
    subject: draft?.subject ?? null,
    to: draft?.to ?? []
  }
}

export function listScheduled(db: DB): ScheduledSend[] {
  const rows = db.all("SELECT * FROM scheduled_sends WHERE status = 'scheduled' ORDER BY send_at") as unknown as Row[]
  return rows.map((r) => toScheduled(db, r))
}

// Rows whose time has come (used by the background sender).
export function dueScheduled(db: DB, nowIso: string): ScheduledSend[] {
  const rows = db.all("SELECT * FROM scheduled_sends WHERE status = 'scheduled' AND send_at <= ?", [nowIso]) as unknown as Row[]
  return rows.map((r) => toScheduled(db, r))
}

export function cancelScheduled(db: DB, id: number): void {
  const row = db.get('SELECT draft_id FROM scheduled_sends WHERE id = ?', [id]) as { draft_id: number | null } | undefined
  db.run("UPDATE scheduled_sends SET status = 'cancelled' WHERE id = ?", [id])
  if (row?.draft_id != null) deleteDraft(db, row.draft_id)
}

export function markSent(db: DB, id: number): void {
  const row = db.get('SELECT draft_id FROM scheduled_sends WHERE id = ?', [id]) as { draft_id: number | null } | undefined
  db.run("UPDATE scheduled_sends SET status = 'sent' WHERE id = ?", [id])
  if (row?.draft_id != null) deleteDraft(db, row.draft_id)
}

export function markError(db: DB, id: number, error?: string): void {
  db.run("UPDATE scheduled_sends SET status = 'error', last_error = ? WHERE id = ?", [error ?? null, id])
}
