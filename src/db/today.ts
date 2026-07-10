import type { AwaitingReply, MessageListItem, TodayAgenda } from '@shared/db'
import { listEvents } from './events'
import { listTasks } from './tasks'
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

function bareSubject(s: string | null): string {
  return (s ?? '').replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, '').trim().toLowerCase()
}

// "Waiting on a reply": sent messages older than N days where none of the
// recipients has come back — matched by In-Reply-To/References against the sent
// Message-ID, or by a "Re: <same subject>". Dismissed ones stay dismissed.
export function getAwaitingReply(db: DB, olderThanDays = 3, cap = 10): AwaitingReply[] {
  const myEmails = new Set(
    (db.all('SELECT email_address e FROM accounts') as unknown as { e: string }[]).map((r) => r.e.toLowerCase())
  )
  const sent = db.all(
    `SELECT m.id, m.account_id, m.subject, m.to_json, m.sent_at, m.message_id_header
       FROM messages m JOIN folders f ON f.id = m.folder_id
      WHERE f.role = 'sent'
        AND m.sent_at IS NOT NULL AND m.sent_at <= datetime('now', '-' || ? || ' days')
        AND m.id NOT IN (SELECT message_id FROM nudge_dismissals)
      ORDER BY m.sent_at DESC LIMIT 100`,
    [olderThanDays]
  ) as unknown as { id: number; account_id: number; subject: string | null; to_json: string | null; sent_at: string; message_id_header: string | null }[]

  const out: AwaitingReply[] = []
  for (const s of sent) {
    if (out.length >= cap) break
    const recipients = parseArr(s.to_json).map((r) => r.toLowerCase()).filter((r) => r.includes('@') && !myEmails.has(r))
    if (recipients.length === 0) continue // self-addressed — nothing to wait on

    const placeholders = recipients.map(() => '?').join(',')
    const candidates = db.all(
      `SELECT subject, references_json FROM messages
        WHERE id != ? AND LOWER(from_email) IN (${placeholders}) AND received_at >= ?`,
      [s.id, ...recipients, s.sent_at]
    ) as unknown as { subject: string | null; references_json: string | null }[]

    const subject = bareSubject(s.subject)
    const replied = candidates.some(
      (c) =>
        (s.message_id_header != null && (c.references_json ?? '').includes(s.message_id_header)) ||
        (subject !== '' && bareSubject(c.subject) === subject)
    )
    if (!replied) {
      out.push({ id: s.id, accountId: s.account_id, subject: s.subject, to: parseArr(s.to_json), sentAt: s.sent_at })
    }
  }
  return out
}

export function dismissNudge(db: DB, messageId: number): void {
  db.run('INSERT INTO nudge_dismissals (message_id) VALUES (?) ON CONFLICT(message_id) DO NOTHING', [messageId])
}

interface MsgRow {
  id: number
  account_id: number
  folder_id: number | null
  from_name: string | null
  from_email: string | null
  subject: string | null
  snippet: string | null
  received_at: string | null
  is_read: number
  is_starred: number
  has_attachments: number
  is_pinned: number
  is_muted: number
  importance: string | null
  is_focused: number
}

export interface TodayOpts {
  includeUnread?: boolean // default true
  includeStarred?: boolean // default false
}

// The unified Today view: today's events + mail that needs attention. What
// counts as "needs attention" is tunable — unread and/or starred — so the owner
// decides what surfaces. Muted and currently-snoozed mail is always excluded.
export function getTodayAgenda(db: DB, todayIso: string, opts: TodayOpts = {}): TodayAgenda {
  const events = listEvents(db, todayIso, todayIso)
  const conds: string[] = []
  if (opts.includeUnread ?? true) conds.push('is_read = 0')
  if (opts.includeStarred ?? false) conds.push('is_starred = 1')
  const attention = conds.length ? `(${conds.join(' OR ')})` : '0'
  const rows = db.all(
    `SELECT * FROM messages
       WHERE (${attention} OR (followup_at IS NOT NULL AND followup_at <= datetime('now'))) AND is_muted = 0
         AND id NOT IN (SELECT message_id FROM snoozes WHERE datetime(snooze_until) > datetime('now'))
     ORDER BY received_at DESC, id DESC
     LIMIT 50`
  ) as unknown as MsgRow[]
  const messages: MessageListItem[] = rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    snippet: r.snippet,
    receivedAt: r.received_at,
    isRead: !!r.is_read,
    isStarred: !!r.is_starred,
    hasAttachments: !!r.has_attachments,
    isPinned: !!r.is_pinned,
    isMuted: !!r.is_muted,
    importance: (r.importance as MessageListItem['importance']) ?? null,
    isFocused: r.is_focused == null ? true : !!r.is_focused
  }))
  return { events, messages, tasks: listTasks(db), awaitingReply: getAwaitingReply(db) }
}
