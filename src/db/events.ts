import type { EventAttendee, EventInput, EventSummary } from '@shared/db'
import { generateJoinLink, type MeetingProvider } from '@shared/meetings'
import type { DB } from './database'

// Create an event. Video providers get a generated join link if none was given.
export function createEvent(db: DB, e: EventInput): number {
  const joinUrl = e.joinUrl ?? generateJoinLink(e.provider, e.location ?? undefined)
  db.run(
    `INSERT INTO events (title, date, start, end, provider, location, join_url, notes, calendar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.title, e.date, e.start, e.end, e.provider, e.location, joinUrl, e.notes, e.calendar]
  )
  const id = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  for (const g of e.guests) {
    const name = g.trim()
    if (name) db.run('INSERT INTO event_attendees (event_id, name, email, response) VALUES (?, ?, ?, ?)', [id, name, null, 'needs-action'])
  }
  return id
}

interface EventRow {
  id: number
  title: string
  date: string
  start: string | null
  end: string | null
  provider: string
  location: string | null
  join_url: string | null
  notes: string | null
  calendar: string | null
}

function attendeesFor(db: DB, eventId: number): EventAttendee[] {
  const rows = db.all('SELECT name, email, response FROM event_attendees WHERE event_id = ?', [eventId]) as unknown as {
    name: string | null
    email: string | null
    response: string | null
  }[]
  return rows.map((r) => ({ name: r.name, email: r.email, response: r.response }))
}

function toSummary(db: DB, r: EventRow): EventSummary {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    start: r.start,
    end: r.end,
    provider: r.provider as MeetingProvider,
    location: r.location,
    joinUrl: r.join_url,
    notes: r.notes,
    calendar: r.calendar,
    attendees: attendeesFor(db, r.id)
  }
}

// List events, optionally within a date range (inclusive, YYYY-MM-DD).
export function listEvents(db: DB, from?: string, to?: string): EventSummary[] {
  const rows = (
    from && to
      ? db.all('SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date, start', [from, to])
      : db.all('SELECT * FROM events ORDER BY date, start')
  ) as unknown as EventRow[]
  return rows.map((r) => toSummary(db, r))
}

export function getEvent(db: DB, id: number): EventSummary | null {
  const r = db.get('SELECT * FROM events WHERE id = ?', [id]) as unknown as EventRow | undefined
  return r ? toSummary(db, r) : null
}

export function updateEvent(db: DB, id: number, e: EventInput): void {
  db.run(
    `UPDATE events SET title = ?, date = ?, start = ?, end = ?, provider = ?, location = ?, join_url = ?,
       notes = ?, calendar = ?, updated_at = datetime('now') WHERE id = ?`,
    [e.title, e.date, e.start, e.end, e.provider, e.location, e.joinUrl, e.notes, e.calendar, id]
  )
}

export function deleteEvent(db: DB, id: number): void {
  db.run('DELETE FROM events WHERE id = ?', [id])
}
