import { describe, expect, it } from 'vitest'
import { messageDateGroup } from '../../src/renderer/mail/format'

const now = new Date('2026-07-10T12:00:00')

describe('messageDateGroup', () => {
  it('buckets by recency relative to now', () => {
    expect(messageDateGroup('2026-07-10T09:00:00', now)).toBe('Today')
    expect(messageDateGroup('2026-07-09T23:00:00', now)).toBe('Yesterday')
    expect(messageDateGroup('2026-07-06T10:00:00', now)).toBe('This week')
    expect(messageDateGroup('2026-07-02T10:00:00', now)).toBe('Earlier this month')
    expect(messageDateGroup('2026-05-02T10:00:00', now)).toBe('Older')
  })
  it('handles missing/invalid dates as Older', () => {
    expect(messageDateGroup(null, now)).toBe('Older')
    expect(messageDateGroup('not-a-date', now)).toBe('Older')
  })
})
