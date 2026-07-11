import type { SnoozeOption } from '@shared/db'
import type { DB } from './database'

// Compute a snooze target time from a quick option. Pure, so it's testable.
export function computeSnoozeTime(option: SnoozeOption, now = new Date()): string {
  const d = new Date(now)
  switch (option) {
    case 'later':
      d.setHours(d.getHours() + 3, 0, 0, 0)
      break
    case 'tomorrow':
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      break
    case 'weekend': {
      // Next Saturday 09:00.
      const day = d.getDay() // 0 Sun .. 6 Sat
      const add = (6 - day + 7) % 7 || 7
      d.setDate(d.getDate() + add)
      d.setHours(9, 0, 0, 0)
      break
    }
    case 'nextweek': {
      // Next Monday 08:00.
      const day = d.getDay()
      const add = (1 - day + 7) % 7 || 7
      d.setDate(d.getDate() + add)
      d.setHours(8, 0, 0, 0)
      break
    }
  }
  return d.toISOString()
}

export function snoozeMessage(db: DB, messageId: number, untilIso: string): void {
  db.run('DELETE FROM snoozes WHERE message_id = ?', [messageId])
  db.run('INSERT INTO snoozes (message_id, snooze_until) VALUES (?, ?)', [messageId, untilIso])
}

export function unsnooze(db: DB, messageId: number): void {
  db.run('DELETE FROM snoozes WHERE message_id = ?', [messageId])
}

// Is the message hidden right now?
export function isSnoozed(db: DB, messageId: number, nowIso: string): boolean {
  const row = db.get('SELECT 1 FROM snoozes WHERE message_id = ? AND snooze_until > ?', [messageId, nowIso])
  return !!row
}
