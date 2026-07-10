import { describe, expect, it } from 'vitest'
import { resolveTzid, utcToLocalParts, zonedToUtc } from '../../src/shared/tz'
import { parseIcs } from '../../src/main/mail/ics'

// zonedToUtc returns exact UTC instants, so these assertions are independent of
// the machine running the tests.
describe('timezone conversion', () => {
  it('CET winter: 14:00 Paris = 13:00 UTC', () => {
    expect(zonedToUtc(2026, 1, 15, 14, 0, 'Europe/Paris')!.toISOString()).toBe('2026-01-15T13:00:00.000Z')
  })

  it('CEST summer (DST): 14:00 Paris = 12:00 UTC', () => {
    expect(zonedToUtc(2026, 7, 15, 14, 0, 'Europe/Paris')!.toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('New York across the DST boundary', () => {
    // 2026-03-08 02:30 does not exist in America/New_York (spring forward).
    // The two-pass conversion still lands on a sane instant either side of it.
    expect(zonedToUtc(2026, 3, 7, 9, 0, 'America/New_York')!.toISOString()).toBe('2026-03-07T14:00:00.000Z') // EST −5
    expect(zonedToUtc(2026, 3, 9, 9, 0, 'America/New_York')!.toISOString()).toBe('2026-03-09T13:00:00.000Z') // EDT −4
  })

  it('Windows timezone names map to IANA; junk resolves to null', () => {
    expect(resolveTzid('Romance Standard Time')).toBe('Europe/Paris')
    expect(resolveTzid('GMT Standard Time')).toBe('Europe/London')
    expect(resolveTzid('Europe/Berlin')).toBe('Europe/Berlin')
    expect(resolveTzid('Jupiter Standard Time')).toBeNull()
  })
})

const icsWith = (dtstart: string): string =>
  ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Call', dtstart, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')

describe('ICS invite times', () => {
  it('floating time (no TZID, no Z) stays literal', () => {
    const inv = parseIcs(icsWith('DTSTART:20260710T140000'))!
    expect(inv.date).toBe('2026-07-10')
    expect(inv.start).toBe('14:00')
    expect(inv.originalTime ?? null).toBeNull()
  })

  it('UTC (Z) converts to this machine’s local time', () => {
    const inv = parseIcs(icsWith('DTSTART:20260710T130000Z'))!
    const local = utcToLocalParts(new Date(Date.UTC(2026, 6, 10, 13, 0)))
    expect(inv.date).toBe(local.date)
    expect(inv.start).toBe(local.time)
  })

  it('TZID converts to local and remembers the original', () => {
    const inv = parseIcs(icsWith('DTSTART;TZID=Europe/Paris:20260115T140000'))!
    const local = utcToLocalParts(zonedToUtc(2026, 1, 15, 14, 0, 'Europe/Paris')!)
    expect(inv.start).toBe(local.time)
    if (local.time !== '14:00' || local.date !== '2026-01-15') {
      expect(inv.originalTime).toBe('14:00 Europe/Paris')
    }
  })

  it('Windows-name TZID converts too', () => {
    const inv = parseIcs(icsWith('DTSTART;TZID=Tokyo Standard Time:20260710T090000'))!
    const local = utcToLocalParts(zonedToUtc(2026, 7, 10, 9, 0, 'Asia/Tokyo')!)
    expect(inv.start).toBe(local.time)
    expect(inv.date).toBe(local.date)
  })

  it('unknown TZID keeps the literal time and flags it honestly', () => {
    const inv = parseIcs(icsWith('DTSTART;TZID=Jupiter Standard Time:20260710T140000'))!
    expect(inv.start).toBe('14:00')
    expect(inv.tzUnknown).toBe(true)
  })
})
