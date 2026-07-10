import type { MessageListItem, TodayAgenda } from '@shared/db'
import { listEvents } from './events'
import { listTasks } from './tasks'
import type { DB } from './database'

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
    importance: (r.importance as MessageListItem['importance']) ?? null
  }))
  return { events, messages, tasks: listTasks(db) }
}
