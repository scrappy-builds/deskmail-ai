import { describe, expect, it } from 'vitest'
import { reminderDueAt } from '../../src/shared/reminders'

describe('reminderDueAt', () => {
  it('returns null when the event has no reminder', () => {
    expect(reminderDueAt('2026-07-12', '14:00', null)).toBeNull()
  })

  it('subtracts the offset from the start time', () => {
    expect(reminderDueAt('2026-07-12', '14:00', 15)).toBe('2026-07-12T13:45')
  })

  it('falls back to 09:00 for an all-day event (no start)', () => {
    expect(reminderDueAt('2026-07-12', null, 30)).toBe('2026-07-12T08:30')
  })

  it('rolls back over midnight when the offset crosses a day boundary', () => {
    expect(reminderDueAt('2026-07-12', '00:05', 15)).toBe('2026-07-11T23:50')
  })

  it('lets a snooze time override the computed offset', () => {
    expect(reminderDueAt('2026-07-12', '14:00', 15, '2026-07-12T15:00')).toBe('2026-07-12T15:00')
  })
})
