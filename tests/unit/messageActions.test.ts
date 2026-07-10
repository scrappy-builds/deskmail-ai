import { describe, expect, it } from 'vitest'
import type { MessageListItem } from '../../src/shared/db'
import { aggregateFlags, effectiveTargets } from '../../src/renderer/mail/messageActions'

function row(id: number, over: Partial<MessageListItem> = {}): MessageListItem {
  return {
    id, accountId: 1, folderId: 1, fromName: null, fromEmail: null, subject: null, snippet: null,
    receivedAt: null, isRead: true, isStarred: false, hasAttachments: false, isPinned: false, isMuted: false,
    ...over
  }
}

describe('effectiveTargets', () => {
  it('prefers the ticked set when any are ticked', () => {
    expect(effectiveTargets(new Set([2, 3]), 9)).toEqual([2, 3])
  })
  it('falls back to the open message when nothing is ticked', () => {
    expect(effectiveTargets(new Set(), 9)).toEqual([9])
  })
  it('is empty when nothing is selected at all', () => {
    expect(effectiveTargets(new Set(), null)).toEqual([])
  })
})

describe('aggregateFlags', () => {
  const messages = [row(1, { isRead: false }), row(2, { isRead: true, isStarred: true }), row(3, { isPinned: true })]

  it('reports any-unread across the target set', () => {
    expect(aggregateFlags(messages, [1, 2]).anyUnread).toBe(true)
    expect(aggregateFlags(messages, [2]).anyUnread).toBe(false)
  })
  it('reports any-unflagged / any-unpinned', () => {
    expect(aggregateFlags(messages, [2]).anyUnflagged).toBe(false) // 2 is starred
    expect(aggregateFlags(messages, [1]).anyUnflagged).toBe(true)
    expect(aggregateFlags(messages, [3]).anyUnpinned).toBe(false) // 3 is pinned
  })
  it('uses the fallback detail for a single target not in the list', () => {
    const f = aggregateFlags(messages, [99], { isRead: false, isStarred: false, isPinned: false })
    expect(f.anyUnread).toBe(true)
  })
})
