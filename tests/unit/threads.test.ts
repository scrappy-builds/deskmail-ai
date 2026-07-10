import { describe, expect, it } from 'vitest'
import type { MessageListItem } from '../../src/shared/db'
import { groupThreads, normalizeSubject } from '../../src/renderer/mail/threads'

function m(id: number, subject: string | null): MessageListItem {
  return { id, accountId: 1, folderId: 1, fromName: null, fromEmail: null, subject, snippet: null, receivedAt: null, isRead: true, isStarred: false, hasAttachments: false, isPinned: false, isMuted: false, importance: null }
}

describe('normalizeSubject', () => {
  it('strips nested Re:/Fwd: prefixes and lowercases', () => {
    expect(normalizeSubject('Re: Fwd: Q3 Launch')).toBe('q3 launch')
    expect(normalizeSubject('FW: Hello')).toBe('hello')
  })
})

describe('groupThreads', () => {
  it('groups by normalised subject, keeping first-seen order', () => {
    const threads = groupThreads([m(1, 'Q3 launch'), m(2, 'Other'), m(3, 'Re: Q3 launch')])
    expect(threads).toHaveLength(2)
    expect(threads[0].items.map((x) => x.id)).toEqual([1, 3])
    expect(threads[1].items.map((x) => x.id)).toEqual([2])
  })
  it('keeps subject-less messages separate', () => {
    const threads = groupThreads([m(1, null), m(2, null)])
    expect(threads).toHaveLength(2)
  })
})
