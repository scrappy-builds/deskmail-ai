import type { RecurFreq } from './db'

// Pure reminder scheduling. Times are LOCAL wall-clock strings, matching how the
// calendar stores an event's date (YYYY-MM-DD) and start (HH:MM). Kept free of
// Electron/DB imports so it can be unit-tested on its own.

// Format a Date's local wall-clock as 'YYYY-MM-DDTHH:MM' (fixed width, so plain
// string comparison orders two stamps correctly).
export function localStamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Parse a 'YYYY-MM-DDTHH:MM' local stamp back into a Date (local wall-clock).
export function parseLocalStamp(s: string): Date {
  const [datePart, timePart] = s.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = (timePart || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

// When should an event's reminder fire? Returns a local wall-clock stamp, or null
// if the event has no reminder. Base time = date at start (or 09:00 if all-day);
// due = that minus reminderMinutes. A snooze time, if set, overrides the offset.
export function reminderDueAt(
  dateISO: string,
  start: string | null,
  reminderMinutes: number | null,
  snoozeUntil?: string | null
): string | null {
  if (reminderMinutes == null) return null
  if (snoozeUntil) return snoozeUntil
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = (start || '09:00').split(':').map(Number)
  const base = new Date(y, m - 1, d, hh, mm, 0, 0)
  base.setMinutes(base.getMinutes() - reminderMinutes)
  return localStamp(base)
}

function isoOf(dt: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

// The next reminder due stamp for a possibly-recurring event: the earliest
// occurrence whose reminder time is strictly after `firedStamp` (the last one
// already alerted) and no older than `notBefore` (occurrences missed while the
// app was closed are skipped, not spammed on launch). A snooze time overrides
// with a one-off due. Returns null when there's nothing left to fire — this is
// what makes a recurring entry remind on every occurrence rather than only its
// first. Pure, so it's unit-tested.
export function nextReminderDue(
  dateISO: string,
  start: string | null,
  reminderMinutes: number | null,
  freq: RecurFreq | null,
  until: string | null,
  snoozeUntil: string | null,
  firedStamp: string | null,
  notBefore: string | null
): string | null {
  if (reminderMinutes == null) return null
  if (snoozeUntil) return snoozeUntil
  const fits = (due: string | null): boolean =>
    due != null && (!firedStamp || due > firedStamp) && (!notBefore || due >= notBefore)

  if (!freq || freq === 'none') {
    const due = reminderDueAt(dateISO, start, reminderMinutes)
    return fits(due) ? due : null
  }

  const [y, m, d] = dateISO.split('-').map(Number)
  const cur = new Date(y, m - 1, d)
  let guard = 0
  while (guard++ < 4000) {
    const iso = isoOf(cur)
    if (until && iso > until) return null
    const due = reminderDueAt(iso, start, reminderMinutes)
    if (fits(due)) return due
    if (freq === 'daily') cur.setDate(cur.getDate() + 1)
    else if (freq === 'weekly') cur.setDate(cur.getDate() + 7)
    else cur.setMonth(cur.getMonth() + 1) // monthly
  }
  return null
}
