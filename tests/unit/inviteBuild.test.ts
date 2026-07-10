import { describe, expect, it } from 'vitest'
import { buildInviteIcs, escapeIcsText, parseIcs } from '../../src/main/mail/ics'
import { utcToLocalParts, zonedToUtc } from '../../src/shared/tz'

const BASE = {
  uid: 'deskmail-42-abc@deskmail.local',
  title: 'Print farm review',
  date: '2026-07-20',
  start: '14:00',
  end: '14:30',
  location: 'Workshop',
  organizer: { name: 'Jamie Bell', email: 'jamie@functional3duk.co.uk' },
  attendees: [{ email: 'maya@northwind.studio', name: 'Maya Chen' }]
}

describe('building outgoing invites', () => {
  it('a REQUEST round-trips through our own parser', () => {
    const ics = buildInviteIcs({ ...BASE, method: 'REQUEST' })
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('UID:deskmail-42-abc@deskmail.local')
    expect(ics).toContain('ATTENDEE;CN=Maya Chen;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:maya@northwind.studio')

    const inv = parseIcs(ics)!
    expect(inv.title).toBe('Print farm review')
    expect(inv.uid).toBe(BASE.uid)
    expect(inv.organiserEmail).toBe('jamie@functional3duk.co.uk')
    // Times went out as UTC; parsing them back to local lands on the original wall clock.
    expect(inv.date).toBe('2026-07-20')
    expect(inv.start).toBe('14:00')
    expect(inv.end).toBe('14:30')
  })

  it('a REPLY carries my PARTSTAT and the original UID', () => {
    const ics = buildInviteIcs({
      ...BASE,
      uid: 'their-uid-123@example.com',
      organizer: { name: 'Maya Chen', email: 'maya@northwind.studio' },
      attendees: [{ email: 'jamie@functional3duk.co.uk', name: 'Jamie Bell' }],
      method: 'REPLY',
      myResponse: 'ACCEPTED'
    })
    expect(ics).toContain('METHOD:REPLY')
    expect(ics).toContain('UID:their-uid-123@example.com')
    expect(ics).toContain('ATTENDEE;CN=Jamie Bell;PARTSTAT=ACCEPTED:mailto:jamie@functional3duk.co.uk')
    expect(ics).not.toContain('RSVP=TRUE')
  })

  it('summary and location are escaped', () => {
    expect(escapeIcsText('a;b,c\nnew')).toBe('a\\;b\\,c\\nnew')
    const ics = buildInviteIcs({ ...BASE, title: 'Review; phase 1, part A', method: 'REQUEST' })
    expect(ics).toContain('SUMMARY:Review\\; phase 1\\, part A')
  })

  it('all-day events use VALUE=DATE', () => {
    const ics = buildInviteIcs({ ...BASE, start: null, end: null, method: 'REQUEST' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720')
    expect(ics).not.toContain('DTEND')
  })

  it('sanity: local→UTC→local round-trip used by the builder is stable', () => {
    // The builder converts local wall-clock to UTC via Date; parsing converts back.
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const utc = zonedToUtc(2026, 7, 20, 14, 0, localZone)!
    expect(utcToLocalParts(utc)).toEqual({ date: '2026-07-20', time: '14:00' })
  })
})
