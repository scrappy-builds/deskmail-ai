import type { MessageListItem, TodayAgenda } from '@shared/db'
import { listEvents } from './events'
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
}

// The unified Today view: today's events + mail that needs attention (unread,
// not snoozed). The first thing the owner sees to plan the day.
export function getTodayAgenda(db: DB, todayIso: string): TodayAgenda {
  const events = listEvents(db, todayIso, todayIso)
  const rows = db.all(
    `SELECT * FROM messages
       WHERE is_read = 0
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
    hasAttachments: !!r.has_attachments
  }))
  return { events, messages }
}
