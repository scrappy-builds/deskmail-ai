import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { openDatabase, runMigrations } from '../../src/db/database'
import { loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty } from '../../src/db/settings'
import { DEFAULT_LAYOUT } from '../../src/shared/layout'

const EXPECTED_TABLES = [
  'accounts', 'credentials', 'folders', 'messages', 'attachments', 'drafts', 'labels',
  'message_labels', 'sync_state', 'layout_preferences', 'app_settings', 'signatures',
  'scheduled_sends', 'snoozes', 'templates', 'contacts', 'events', 'event_attendees'
]

describe('database migrations', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates every table and sets user_version', () => {
    const db = openDatabase(file)
    const version = (db.get('PRAGMA user_version') as { user_version: number }).user_version
    expect(version).toBe(3)

    const rows = db.all("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[]
    const names = rows.map((r) => r.name)
    for (const t of EXPECTED_TABLES) expect(names).toContain(t)
    db.close()
  })

  it('is idempotent — re-running migrations changes nothing', () => {
    const db = openDatabase(file)
    runMigrations(db) // again
    const version = (db.get('PRAGMA user_version') as { user_version: number }).user_version
    expect(version).toBe(3)
    db.close()
  })

  it('persists to disk and reopens', () => {
    const db = openDatabase(file)
    db.run("INSERT INTO labels (name, colour) VALUES ('Work', '#1e7a38')")
    db.close()

    const db2 = new Database(file)
    const row = db2.get("SELECT name FROM labels WHERE name='Work'") as { name: string }
    expect(row.name).toBe('Work')
    db2.close()
  })
})

describe('layout preferences store', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('seeds defaults then round-trips changes', () => {
    const db = openDatabase(file)
    seedLayoutIfEmpty(db, null)
    expect(loadLayoutPrefs(db)).toEqual(DEFAULT_LAYOUT)

    saveLayoutPrefs(db, { ...DEFAULT_LAYOUT, theme: 'dark', sidebarMode: 'icons', previewLineCount: 0 })
    const loaded = loadLayoutPrefs(db)
    expect(loaded.theme).toBe('dark')
    expect(loaded.sidebarMode).toBe('icons')
    expect(loaded.previewLineCount).toBe(0)
    db.close()
  })

  it('imports a legacy settings object on first seed', () => {
    const db = openDatabase(file)
    seedLayoutIfEmpty(db, { ...DEFAULT_LAYOUT, theme: 'dark' })
    expect(loadLayoutPrefs(db).theme).toBe('dark')
    db.close()
  })
})
