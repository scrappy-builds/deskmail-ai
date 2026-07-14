import { describe, expect, it } from 'vitest'
import { buildInviteIcs, escapeIcsText, fallbackInviteFromBody, parseIcs } from '../../src/main/mail/ics'
import { meetingJoinLink } from '../../src/shared/meetings'
import { utcToLocalParts, zonedToUtc } from '../../src/shared/tz'

const BASE = {
  uid: 'deskmail-42-abc@deskmail.local',
  title: 'Print farm review',
  date: '2026-07-20',
  start: '14:00',
  end: '14:30',
  location: 'Workshop',
  organizer: { name: 'Alex Doe', email: 'alex@example.com' },
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
    expect(inv.organiserEmail).toBe('alex@example.com')
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
      attendees: [{ email: 'alex@example.com', name: 'Alex Doe' }],
      method: 'REPLY',
      myResponse: 'ACCEPTED'
    })
    expect(ics).toContain('METHOD:REPLY')
    expect(ics).toContain('UID:their-uid-123@example.com')
    expect(ics).toContain('ATTENDEE;CN=Alex Doe;PARTSTAT=ACCEPTED:mailto:alex@example.com')
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

  it('detects only real Teams/Meet/Zoom join links, not mere mentions', () => {
    expect(meetingJoinLink('Join https://teams.microsoft.com/l/meetup-join/19%3aabc/0?context=x here')).toEqual({
      provider: 'teams',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3aabc/0?context=x'
    })
    expect(meetingJoinLink('link: https://meet.google.com/abc-defg-hij')?.provider).toBe('meet')
    expect(meetingJoinLink('https://us02web.zoom.us/j/8412345678?pwd=xyz')?.provider).toBe('zoom')
    // A newsletter that merely name-drops Teams (no join URL) must not match.
    expect(meetingJoinLink('We now use Microsoft Teams for standups.')).toBeNull()
    expect(meetingJoinLink('Read more at https://teams.microsoft.com/downloads')).toBeNull()
  })

  it('trims trailing HTML punctuation off a matched join link', () => {
    const m = meetingJoinLink('<a href="https://teams.microsoft.com/l/meetup-join/19:abc">join</a>')
    expect(m?.url).toBe('https://teams.microsoft.com/l/meetup-join/19:abc')
  })

  it('builds a fallback invite from a body link when there is no .ics', () => {
    const when = new Date('2026-07-13T10:00:00Z')
    const inv = fallbackInviteFromBody(
      '<p>Join the meeting https://teams.microsoft.com/l/meetup-join/19:abc/0</p>',
      'Project sync',
      when,
      { name: 'Boss', email: 'boss@example.com' }
    )!
    expect(inv.title).toBe('Project sync')
    expect(inv.provider).toBe('teams')
    expect(inv.joinUrl).toBe('https://teams.microsoft.com/l/meetup-join/19:abc/0')
    expect(inv.organiserEmail).toBe('boss@example.com')
    expect(inv.fallback).toBe(true)
    // Date/time seeded from arrival (local), so the card can flag it as a guess.
    expect(inv.date).toBe(utcToLocalParts(when).date)
    expect(fallbackInviteFromBody('no links here', 'x', when, { name: null, email: null })).toBeNull()
  })

  it('sanity: local→UTC→local round-trip used by the builder is stable', () => {
    // The builder converts local wall-clock to UTC via Date; parsing converts back.
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const utc = zonedToUtc(2026, 7, 20, 14, 0, localZone)!
    expect(utcToLocalParts(utc)).toEqual({ date: '2026-07-20', time: '14:00' })
  })
})
