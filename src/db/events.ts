import type { EventAttendee, EventInput, EventSummary, RecurFreq } from '@shared/db'
import { generateJoinLink, type MeetingProvider } from '@shared/meetings'
import type { DB } from './database'

// Expand a (possibly recurring) event into the occurrence dates that fall within
// [from, to] (inclusive, YYYY-MM-DD). Non-recurring → at most the base date.
// Pure, so it's unit-tested. ponytail: daily/weekly/monthly only — covers real
// use without a full RRULE engine; add BYDAY/интervals if ever needed.
export function expandOccurrences(startDate: string, freq: RecurFreq | null, until: string | null, from: string, to: string): string[] {
  if (!freq || freq === 'none') return startDate >= from && startDate <= to ? [startDate] : []
  const isoOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [y, m, d] = startDate.split('-').map(Number)
  const cur = new Date(y, m - 1, d)
  const [ty, tm, td] = to.split('-').map(Number)
  const toDate = new Date(ty, tm - 1, td)
  const out: string[] = []
  let guard = 0
  while (cur <= toDate && guard++ < 4000) {
    const iso = isoOf(cur)
    if (until && iso > until) break
    if (iso >= from && iso <= to) out.push(iso)
    if (freq === 'daily') cur.setDate(cur.getDate() + 1)
    else if (freq === 'weekly') cur.setDate(cur.getDate() + 7)
    else cur.setMonth(cur.getMonth() + 1) // monthly
  }
  return out
}

// Create an event. Video providers get a generated join link if none was given.
export function createEvent(db: DB, e: EventInput): number {
  const joinUrl = e.joinUrl ?? generateJoinLink(e.provider, e.location ?? undefined)
  db.run(
    `INSERT INTO events (title, date, start, end, provider, location, join_url, notes, calendar, recur_freq, recur_until, reminder_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.title, e.date, e.start, e.end, e.provider, e.location, joinUrl, e.notes, e.calendar, e.recurFreq, e.recurUntil, e.reminderMinutes ?? null]
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
  recur_freq: string | null
  recur_until: string | null
  reminder_minutes: number | null
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
    attendees: attendeesFor(db, r.id),
    recurFreq: (r.recur_freq as RecurFreq) ?? 'none',
    recurUntil: r.recur_until,
    reminderMinutes: r.reminder_minutes
  }
}

// List events. With a date range, recurring events are expanded into their
// occurrences that fall inside it (each occurrence keeps the series' id).
export function listEvents(db: DB, from?: string, to?: string): EventSummary[] {
  const summaries = (db.all('SELECT * FROM events ORDER BY date, start') as unknown as EventRow[]).map((r) => toSummary(db, r))
  if (!from || !to) return summaries
  const out: EventSummary[] = []
  for (const s of summaries) {
    for (const occ of expandOccurrences(s.date, s.recurFreq, s.recurUntil, from, to)) {
      out.push(occ === s.date ? s : { ...s, date: occ })
    }
  }
  out.sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')))
  return out
}

export function getEvent(db: DB, id: number): EventSummary | null {
  const r = db.get('SELECT * FROM events WHERE id = ?', [id]) as unknown as EventRow | undefined
  return r ? toSummary(db, r) : null
}

export function updateEvent(db: DB, id: number, e: EventInput): void {
  db.run(
    `UPDATE events SET title = ?, date = ?, start = ?, end = ?, provider = ?, location = ?, join_url = ?,
       notes = ?, calendar = ?, recur_freq = ?, recur_until = ?, reminder_minutes = ?, updated_at = datetime('now') WHERE id = ?`,
    [e.title, e.date, e.start, e.end, e.provider, e.location, e.joinUrl, e.notes, e.calendar, e.recurFreq, e.recurUntil, e.reminderMinutes ?? null, id]
  )
}

export function deleteEvent(db: DB, id: number): void {
  db.run('DELETE FROM events WHERE id = ?', [id])
}

// --- Reminder firing --------------------------------------------------------
// Events that have a reminder set and haven't fired yet — the scheduler computes
// each one's due time (via reminderDueAt) and fires those that have arrived.
export interface ReminderCandidate {
  id: number
  title: string
  date: string
  start: string | null
  reminderMinutes: number
  snoozeUntil: string | null
}

export function listReminderCandidates(db: DB): ReminderCandidate[] {
  const rows = db.all(
    `SELECT id, title, date, start, reminder_minutes, reminder_snooze_until
       FROM events
      WHERE reminder_minutes IS NOT NULL AND reminder_fired_at IS NULL`
  ) as unknown as {
    id: number
    title: string
    date: string
    start: string | null
    reminder_minutes: number
    reminder_snooze_until: string | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    start: r.start,
    reminderMinutes: r.reminder_minutes,
    snoozeUntil: r.reminder_snooze_until
  }))
}

// Mark a reminder alerted so it never re-fires (dismiss uses this too).
export function setReminderFired(db: DB, id: number, at: string): void {
  db.run('UPDATE events SET reminder_fired_at = ? WHERE id = ?', [at, id])
}

// Snooze: park the reminder until a later time and re-arm it (clear fired).
export function snoozeReminder(db: DB, id: number, until: string): void {
  db.run('UPDATE events SET reminder_snooze_until = ?, reminder_fired_at = NULL WHERE id = ?', [until, id])
}

// The event's iCalendar UID (generated on first use, then stable — updates and
// replies must reference the same UID the invite went out with).
export function ensureEventUid(db: DB, eventId: number): string {
  const row = db.get('SELECT ics_uid FROM events WHERE id = ?', [eventId]) as { ics_uid: string | null } | undefined
  if (row?.ics_uid) return row.ics_uid
  const uid = `deskmail-${eventId}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@deskmail.local`
  db.run('UPDATE events SET ics_uid = ? WHERE id = ?', [uid, eventId])
  return uid
}
