import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

// Tiny JSON-file settings store. Kept as pure functions over a file path so it
// can be unit-tested without Electron. Replaced by the SQLite app_settings
// table in Stage 4 — same shape, so callers won't change.

export function loadSettings(filePath: string): AppSettings {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    // Merge over defaults so a partial/older file still yields a valid object.
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    // Missing or corrupt file → start from defaults. ponytail: no recovery UI,
    // a broken settings file just resets; add a backup copy if it ever bites.
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(filePath: string, settings: AppSettings): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}
