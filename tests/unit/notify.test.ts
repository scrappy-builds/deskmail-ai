import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { setAppSetting } from '../../src/db/settings'
import { isDndActive, notificationsSuppressed, toMinutes } from '../../src/main/notify'

describe('DND schedule (pure)', () => {
  it('same-day window', () => {
    const from = toMinutes('09:00')
    const to = toMinutes('17:00')
    expect(isDndActive(toMinutes('12:00'), from, to)).toBe(true)
    expect(isDndActive(toMinutes('08:00'), from, to)).toBe(false)
    expect(isDndActive(toMinutes('17:00'), from, to)).toBe(false) // end is exclusive
  })

  it('overnight window wraps midnight', () => {
    const from = toMinutes('22:00')
    const to = toMinutes('07:00')
    expect(isDndActive(toMinutes('23:30'), from, to)).toBe(true)
    expect(isDndActive(toMinutes('06:00'), from, to)).toBe(true)
    expect(isDndActive(toMinutes('12:00'), from, to)).toBe(false)
  })

  it('empty window is never active', () => {
    expect(isDndActive(toMinutes('12:00'), toMinutes('09:00'), toMinutes('09:00'))).toBe(false)
  })
})

describe('notificationsSuppressed', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-notify-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('defaults to showing (not suppressed)', () => {
    expect(notificationsSuppressed(db)).toBe(false)
  })
  it('Focus suppresses', () => {
    setAppSetting(db, 'focus-now', 'on')
    expect(notificationsSuppressed(db)).toBe(true)
  })
  it('turning notifications off suppresses', () => {
    setAppSetting(db, 'notifications-enabled', 'off')
    expect(notificationsSuppressed(db)).toBe(true)
  })
  it('DND window suppresses inside its hours', () => {
    setAppSetting(db, 'dnd-enabled', 'on')
    setAppSetting(db, 'dnd-from', '00:00')
    setAppSetting(db, 'dnd-to', '23:59')
    expect(notificationsSuppressed(db, new Date('2026-07-09T12:00:00'))).toBe(true)
  })
})
