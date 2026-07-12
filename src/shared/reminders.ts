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
