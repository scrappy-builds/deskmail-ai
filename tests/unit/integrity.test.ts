import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, quarantineIfCorrupt, quickCheckOk } from '../../src/db/database'

describe('database integrity gate', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-integrity-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('a healthy database passes quick_check and is not quarantined', () => {
    const file = join(dir, 'deskmail.db')
    const db = openDatabase(file)
    expect(quickCheckOk(db)).toBe(true)
    db.close()
    expect(quarantineIfCorrupt(file)).toBeNull()
    expect(existsSync(file)).toBe(true)
  })

  it('a missing file is fine (fresh install)', () => {
    expect(quarantineIfCorrupt(join(dir, 'nope.db'))).toBeNull()
  })

  it('a corrupt file is moved aside so a fresh store can start', () => {
    const file = join(dir, 'deskmail.db')
    // Not a SQLite file at all — the bluntest corruption there is.
    writeFileSync(file, Buffer.from('definitely not a database'.repeat(100)))
    const quarantined = quarantineIfCorrupt(file)
    expect(quarantined).not.toBeNull()
    expect(existsSync(file)).toBe(false)
    expect(existsSync(quarantined!)).toBe(true)
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true)
    // And a fresh open on the same path now works.
    const db = openDatabase(file)
    expect(quickCheckOk(db)).toBe(true)
    db.close()
  })
})
