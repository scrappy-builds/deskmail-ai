import type { MessageListItem } from '@shared/db'

export type SortField = 'date' | 'sender' | 'subject' | 'unread' | 'flagged'
export type SortDir = 'asc' | 'desc'

export const SORT_LABELS: Record<SortField, string> = {
  date: 'Date',
  sender: 'Sender',
  subject: 'Subject',
  unread: 'Unread first',
  flagged: 'Flagged first'
}

function key(m: MessageListItem, field: SortField): string | number {
  switch (field) {
    case 'sender': return (m.fromName || m.fromEmail || '').toLowerCase()
    case 'subject': return (m.subject || '').toLowerCase()
    case 'unread': return m.isRead ? 1 : 0 // unread (0) sorts ahead when ascending
    case 'flagged': return m.isStarred ? 0 : 1 // flagged sorts ahead when ascending
    default: return m.receivedAt || ''
  }
}

// Sort a copy of the list: pinned messages always float to the top, then the
// chosen field/direction. Stable-ish (ties keep input order).
export function sortMessages(msgs: MessageListItem[], field: SortField, dir: SortDir): MessageListItem[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...msgs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    const av = key(a, field)
    const bv = key(b, field)
    if (av < bv) return -sign
    if (av > bv) return sign
    return 0
  })
}
