import { describe, expect, it } from 'vitest'
import { nextReminderDue, reminderDueAt } from '../../src/shared/reminders'

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

describe('nextReminderDue', () => {
  it('one-off: due once, then nothing after it has fired', () => {
    expect(nextReminderDue('2026-07-12', '14:00', 15, 'none', null, null, null, null)).toBe('2026-07-12T13:45')
    // firedStamp equal to the due → no further occurrence
    expect(nextReminderDue('2026-07-12', '14:00', 15, 'none', null, null, '2026-07-12T13:45', null)).toBeNull()
  })

  it('daily: arms the next occurrence after the last one fired', () => {
    // Base 12 Jul; last fired the 12th → next due is the 13th's reminder.
    expect(nextReminderDue('2026-07-12', '09:00', 10, 'daily', null, null, '2026-07-12T08:50', null)).toBe('2026-07-13T08:50')
  })

  it('skips occurrences older than notBefore (missed while the app was closed)', () => {
    // notBefore of 20 Jul jumps past all the earlier daily occurrences.
    expect(nextReminderDue('2026-07-12', '09:00', 10, 'daily', null, null, null, '2026-07-20T00:00')).toBe('2026-07-20T08:50')
  })

  it('stops at recurUntil', () => {
    expect(nextReminderDue('2026-07-12', '09:00', 10, 'weekly', '2026-07-15', null, '2026-07-12T08:50', null)).toBeNull()
  })

  it('a snooze time overrides with a one-off due', () => {
    expect(nextReminderDue('2026-07-12', '09:00', 10, 'daily', null, '2026-07-12T10:00', null, null)).toBe('2026-07-12T10:00')
  })
})
