import { describe, expect, it } from 'vitest'
import type { MessageListItem } from '../../src/shared/db'
import { sortMessages } from '../../src/renderer/mail/sortMessages'

function m(id: number, over: Partial<MessageListItem> = {}): MessageListItem {
  return {
    id, accountId: 1, folderId: 1, fromName: null, fromEmail: null, subject: null, snippet: null,
    receivedAt: null, isRead: true, isStarred: false, hasAttachments: false, isPinned: false, isMuted: false, ...over
  }
}

describe('sortMessages', () => {
  it('keeps pinned messages on top regardless of sort', () => {
    const list = [m(1, { receivedAt: '2020-01-01' }), m(2, { receivedAt: '2026-01-01', isPinned: true })]
    const out = sortMessages(list, 'date', 'desc')
    expect(out[0].id).toBe(2) // pinned first even though it's older-vs-newer aside
  })
  it('sorts by date descending by default (newest first)', () => {
    const list = [m(1, { receivedAt: '2026-01-01' }), m(2, { receivedAt: '2026-06-01' })]
    expect(sortMessages(list, 'date', 'desc').map((x) => x.id)).toEqual([2, 1])
    expect(sortMessages(list, 'date', 'asc').map((x) => x.id)).toEqual([1, 2])
  })
  it('sorts by sender name case-insensitively', () => {
    const list = [m(1, { fromName: 'Zoe' }), m(2, { fromName: 'adam' })]
    expect(sortMessages(list, 'sender', 'asc').map((x) => x.id)).toEqual([2, 1])
  })
  it('unread-first puts unread messages ahead', () => {
    const list = [m(1, { isRead: true }), m(2, { isRead: false })]
    expect(sortMessages(list, 'unread', 'asc').map((x) => x.id)).toEqual([2, 1])
  })
})
