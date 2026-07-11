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
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
}

function toScheduled(db: DB, r: Row): ScheduledSend {
  const draft = r.draft_id != null ? getDraft(db, r.draft_id) : null
  return {
    id: r.id,
    draftId: r.draft_id,
    accountId: r.account_id,
    sendAt: r.send_at,
    status: r.status,
    attempts: r.attempts ?? 0,
    nextAttemptAt: r.next_attempt_at ?? null,
    lastError: r.last_error ?? null,
    subject: draft?.subject ?? null,
    to: draft?.to ?? []
  }
}

// Pending sends plus failed ones — the Outbox shows both so a failure is loud.
export function listScheduled(db: DB): ScheduledSend[] {
  const rows = db.all("SELECT * FROM scheduled_sends WHERE status IN ('scheduled','error') ORDER BY send_at") as unknown as Row[]
  return rows.map((r) => toScheduled(db, r))
}

// Rows whose time has come (used by the background sender). A row mid-backoff
// (next_attempt_at in the future) is not due yet.
export function dueScheduled(db: DB, nowIso: string): ScheduledSend[] {
  const rows = db.all(
    "SELECT * FROM scheduled_sends WHERE status = 'scheduled' AND send_at <= ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)",
    [nowIso, nowIso]
  ) as unknown as Row[]
  return rows.map((r) => toScheduled(db, r))
}

// --- Retry with backoff --------------------------------------------------------
// Failure n waits BACKOFF_MINUTES[n-1] before the next try; after MAX_ATTEMPTS
// the row lands on 'error' and the caller shouts about it.
export const BACKOFF_MINUTES = [1, 5, 30, 30] as const
export const MAX_ATTEMPTS = 5

// Pure: minutes to wait after the nth failure (1-based), or null when spent.
export function retryDelayMinutes(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) return null
  return BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length) - 1]
}

// Record one failed attempt. Returns {final: true} when the row just moved to
// 'error' (out of retries) so the caller can notify loudly.
export function recordSendFailure(db: DB, id: number, error: string, nowMs = Date.now()): { final: boolean } {
  const row = db.get('SELECT attempts FROM scheduled_sends WHERE id = ?', [id]) as { attempts: number } | undefined
  const attempts = (row?.attempts ?? 0) + 1
  const delay = retryDelayMinutes(attempts)
  if (delay == null) {
    db.run("UPDATE scheduled_sends SET status = 'error', attempts = ?, last_error = ?, next_attempt_at = NULL WHERE id = ?", [attempts, error, id])
    return { final: true }
  }
  const next = new Date(nowMs + delay * 60 * 1000).toISOString()
  db.run('UPDATE scheduled_sends SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?', [attempts, error, next, id])
  return { final: false }
}

// "Retry now" from the Outbox: back to the queue with a fresh set of attempts.
export function retryScheduled(db: DB, id: number): void {
  db.run("UPDATE scheduled_sends SET status = 'scheduled', attempts = 0, next_attempt_at = NULL, send_at = ? WHERE id = ?", [new Date().toISOString(), id])
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
