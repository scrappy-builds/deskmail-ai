import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSettings, saveSettings } from '../../src/main/settings'
import { DEFAULT_LAYOUT as DEFAULT_SETTINGS } from '../../src/shared/layout'

describe('settings store', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-'))
    file = join(dir, 'settings.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns light-theme defaults when no file exists', () => {
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(file).theme).toBe('light')
  })

  it('round-trips saved preferences', () => {
    saveSettings(file, { ...DEFAULT_SETTINGS, theme: 'dark', sidebarMode: 'icons', previewLineCount: 0 })
    const loaded = loadSettings(file)
    expect(loaded.theme).toBe('dark')
    expect(loaded.sidebarMode).toBe('icons')
    expect(loaded.previewLineCount).toBe(0)
  })

  it('falls back to defaults on a corrupt file', () => {
    saveSettings(file, { ...DEFAULT_SETTINGS, theme: 'dark' })
    // Overwrite with junk.
    require('node:fs').writeFileSync(file, '{ not json', 'utf-8')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('merges partial files over defaults', () => {
    require('node:fs').writeFileSync(file, '{}', 'utf-8')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })
})
