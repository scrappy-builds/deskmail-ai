import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../../src/db/events'
import { generateJoinLink, providerFromText } from '../../src/shared/meetings'
import { appUriFor } from '../../src/main/meetings'
import { parseIcs } from '../../src/main/mail/ics'
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
  guests: ['Alex Reed', 'Priya Nair']
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

  it('creates an event, generates a join link, and stores guests', () => {
    const id = createEvent(db, BASE)
    const e = getEvent(db, id)!
    expect(e.title).toBe('Q3 sync')
    expect(e.joinUrl).toMatch(/^https:\/\/teams\.microsoft\.com/)
    expect(e.attendees.map((a) => a.name)).toEqual(['Alex Reed', 'Priya Nair'])
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

  it('in-person events get no join link', () => {
    const id = createEvent(db, { ...BASE, provider: 'inperson' })
    expect(getEvent(db, id)!.joinUrl).toBeNull()
  })
})

describe('meeting links', () => {
  it('generates provider-correct links', () => {
    expect(generateJoinLink('teams')).toMatch(/^https:\/\/teams\.microsoft\.com/)
    expect(generateJoinLink('meet')).toMatch(/^https:\/\/meet\.google\.com/)
    expect(generateJoinLink('zoom')).toMatch(/^https:\/\/zoom\.us\/j\/\d+/)
    expect(generateJoinLink('inperson')).toBeNull()
    expect(generateJoinLink('custom', 'https://whereby.com/room')).toBe('https://whereby.com/room')
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
    expect(inv.date).toBe('2026-07-09')
    expect(inv.start).toBe('14:00')
    expect(inv.end).toBe('14:30')
    expect(inv.organiser).toBe('Maya Chen')
    expect(inv.guests).toContain('Jordan Ellis')
    expect(inv.provider).toBe('teams')
    expect(inv.joinUrl).toBe('https://teams.microsoft.com/l/meetup-join/xyz')
  })

  it('returns null for non-calendar text', () => {
    expect(parseIcs('just a normal email body')).toBeNull()
  })
})
