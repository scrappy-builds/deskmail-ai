import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { createEvent, deleteEvent, expandOccurrences, getEvent, listEvents, updateEvent } from '../../src/db/events'
import { generateJoinLink, providerFromText } from '../../src/shared/meetings'
import { appUriFor } from '../../src/main/meetings'
import { parseIcs } from '../../src/main/mail/ics'
import { utcToLocalParts } from '../../src/shared/tz'
import type { EventInput } from '../../src/shared/db'

const BASE: EventInput = {
  title: 'Q3 sync',
  date: '2026-07-09',
  start: '14:00',
  end: '14:30',
  provider: 'teams',
  location: null,
  joinUrl: null,
  notes: 'confirm dates',
  calendar: 'Work',
  guests: ['Alex Reed', 'Priya Nair'],
  recurFreq: 'none',
  recurUntil: null
}

describe('events CRUD', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-cal-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates an event and stores guests; only a Custom link yields a join link', () => {
    const id = createEvent(db, BASE) // provider 'teams', no pasted link
    const e = getEvent(db, id)!
    expect(e.title).toBe('Q3 sync')
    expect(e.joinUrl).toBeNull() // Teams/Meet/Zoom are no longer fabricated
    expect(e.attendees.map((a) => a.name)).toEqual(['Alex Reed', 'Priya Nair'])

    const id2 = createEvent(db, { ...BASE, provider: 'custom', location: 'https://whereby.com/room' })
    expect(getEvent(db, id2)!.joinUrl).toBe('https://whereby.com/room')
  })

  it('lists events within a date range', () => {
    createEvent(db, BASE)
    createEvent(db, { ...BASE, title: 'Next month', date: '2026-08-02' })
    expect(listEvents(db, '2026-07-01', '2026-07-31')).toHaveLength(1)
    expect(listEvents(db)).toHaveLength(2)
  })

  it('updates and deletes', () => {
    const id = createEvent(db, BASE)
    updateEvent(db, id, { ...BASE, title: 'Q3 sync (moved)', date: '2026-07-10' })
    expect(getEvent(db, id)!.title).toBe('Q3 sync (moved)')
    deleteEvent(db, id)
    expect(getEvent(db, id)).toBeNull()
  })

  it('persists the reminder field (null when omitted, and round-trips an update)', () => {
    // Omitted on the input → stored as null.
    const id = createEvent(db, BASE)
    expect(getEvent(db, id)!.reminderMinutes).toBeNull()

    // Set on create, then changed on update.
    const id2 = createEvent(db, { ...BASE, reminderMinutes: 15 })
    expect(getEvent(db, id2)!.reminderMinutes).toBe(15)
    updateEvent(db, id2, { ...BASE, reminderMinutes: 1440 })
    expect(getEvent(db, id2)!.reminderMinutes).toBe(1440)
    updateEvent(db, id2, { ...BASE, reminderMinutes: null })
    expect(getEvent(db, id2)!.reminderMinutes).toBeNull()
  })

  it('in-person events get no join link', () => {
    const id = createEvent(db, { ...BASE, provider: 'inperson' })
    expect(getEvent(db, id)!.joinUrl).toBeNull()
  })

  it('expands a weekly recurring event across a range', () => {
    createEvent(db, { ...BASE, title: 'Standup', date: '2026-07-06', recurFreq: 'weekly' })
    const week = listEvents(db, '2026-07-06', '2026-07-12')
    expect(week.filter((e) => e.title === 'Standup')).toHaveLength(1)
    const month = listEvents(db, '2026-07-01', '2026-07-31')
    expect(month.filter((e) => e.title === 'Standup')).toHaveLength(4) // Jul 6,13,20,27
  })
})

describe('recurrence expansion (pure)', () => {
  it('daily/weekly/monthly with an until bound; none stays a single date', () => {
    expect(expandOccurrences('2026-07-01', 'none', null, '2026-07-01', '2026-07-31')).toEqual(['2026-07-01'])
    expect(expandOccurrences('2026-07-01', 'daily', '2026-07-03', '2026-07-01', '2026-07-31')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(expandOccurrences('2026-07-06', 'weekly', null, '2026-07-01', '2026-07-31')).toEqual(['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'])
    expect(expandOccurrences('2026-01-15', 'monthly', null, '2026-01-01', '2026-03-31')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })
  it('only returns occurrences inside the window', () => {
    expect(expandOccurrences('2026-07-01', 'daily', null, '2026-07-10', '2026-07-12')).toEqual(['2026-07-10', '2026-07-11', '2026-07-12'])
  })
})

describe('meeting links', () => {
  it('only returns a real (pasted) Custom link — never fabricates Teams/Meet/Zoom', () => {
    expect(generateJoinLink('teams')).toBeNull()
    expect(generateJoinLink('meet')).toBeNull()
    expect(generateJoinLink('zoom')).toBeNull()
    expect(generateJoinLink('inperson')).toBeNull()
    expect(generateJoinLink('custom', 'https://whereby.com/room')).toBe('https://whereby.com/room')
    expect(generateJoinLink('custom')).toBeNull()
  })

  it('derives desktop deep links, browser-only for others', () => {
    expect(appUriFor('teams', 'https://teams.microsoft.com/l/meetup-join/abc')).toBe('msteams:/l/meetup-join/abc')
    expect(appUriFor('zoom', 'https://zoom.us/j/123456789')).toBe('zoommtg://zoom.us/join?confno=123456789')
    expect(appUriFor('meet', 'https://meet.google.com/abc-defg-hij')).toBeNull()
  })

  it('detects the provider from text', () => {
    expect(providerFromText('https://teams.microsoft.com/x')).toBe('teams')
    expect(providerFromText('Zoom link: https://zoom.us/j/1')).toBe('zoom')
    expect(providerFromText('Meeting room 3B')).toBe('inperson')
  })
})

describe('ICS invite parsing', () => {
  const ICS = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Q3 launch sync',
    'DTSTART:20260709T140000Z',
    'DTEND:20260709T143000Z',
    'LOCATION:Microsoft Teams Meeting',
    'URL:https://teams.microsoft.com/l/meetup-join/xyz',
    'ORGANIZER;CN=Maya Chen:mailto:maya@northwind.studio',
    'ATTENDEE;CN=Jordan Ellis:mailto:jordan@fastmail.com',
    'ATTENDEE;CN=Alex Reed:mailto:alex@northwind.studio',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  it('extracts the event details', () => {
    const inv = parseIcs(ICS)!
    expect(inv.title).toBe('Q3 launch sync')
    // UTC (`Z`) invite times now convert to this machine's local wall clock.
    const localStart = utcToLocalParts(new Date(Date.UTC(2026, 6, 9, 14, 0)))
    const localEnd = utcToLocalParts(new Date(Date.UTC(2026, 6, 9, 14, 30)))
    expect(inv.date).toBe(localStart.date)
    expect(inv.start).toBe(localStart.time)
    expect(inv.end).toBe(localEnd.time)
    expect(inv.organiser).toBe('Maya Chen')
    expect(inv.guests).toContain('Jordan Ellis')
    expect(inv.provider).toBe('teams')
    expect(inv.joinUrl).toBe('https://teams.microsoft.com/l/meetup-join/xyz')
  })

  it('returns null for non-calendar text', () => {
    expect(parseIcs('just a normal email body')).toBeNull()
  })
})
