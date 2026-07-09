import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveDataDir } from '../../src/main/dataDir'
import { backupTo, restoreFrom } from '../../src/main/backup'

describe('resolveDataDir (portable / override precedence)', () => {
  const base = { argv: ['electron', 'main.js'], env: {} as NodeJS.ProcessEnv, exeDir: '/app', exists: () => false }

  it('honours DESKMAIL_USER_DATA first', () => {
    expect(resolveDataDir({ ...base, env: { DESKMAIL_USER_DATA: '/tmp/x' } })).toEqual({ dir: '/tmp/x', portable: false })
  })
  it('--portable with an explicit dir', () => {
    expect(resolveDataDir({ ...base, argv: ['e', 'm', '--portable', '/usb/data'] })).toEqual({ dir: '/usb/data', portable: true })
  })
  it('--portable with no dir uses <exeDir>/data', () => {
    expect(resolveDataDir({ ...base, argv: ['e', 'm', '--portable'] })).toEqual({ dir: join('/app', 'data'), portable: true })
  })
  it('a portable.txt marker next to the exe triggers portable mode', () => {
    expect(resolveDataDir({ ...base, exists: (p) => p === join('/app', 'portable.txt') })).toEqual({ dir: join('/app', 'data'), portable: true })
  })
  it('otherwise falls back to the OS default (null)', () => {
    expect(resolveDataDir(base)).toEqual({ dir: null, portable: false })
  })
})

describe('backup / restore round-trip', () => {
  let root: string
  let userData: string
  let backups: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskmail-pkg-'))
    userData = join(root, 'userData')
    backups = join(root, 'backups')
    mkdirSync(join(userData, 'attachments'), { recursive: true })
    mkdirSync(backups, { recursive: true })
    writeFileSync(join(userData, 'deskmail.db'), 'DBDATA-v1')
    writeFileSync(join(userData, 'settings.json'), '{"theme":"dark"}')
    writeFileSync(join(userData, 'attachments', 'a.txt'), 'hello')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('backs up the db, attachments and settings into a self-contained folder', () => {
    const dest = backupTo(userData, backups, 'STAMP')
    expect(dest).toBe(join(backups, 'deskmail-backup-STAMP'))
    expect(readFileSync(join(dest, 'deskmail.db'), 'utf-8')).toBe('DBDATA-v1')
    expect(readFileSync(join(dest, 'attachments', 'a.txt'), 'utf-8')).toBe('hello')
    expect(existsSync(join(dest, 'settings.json'))).toBe(true)
  })

  it('restores a backup into a fresh data directory', () => {
    const dest = backupTo(userData, backups, 'STAMP')
    const fresh = join(root, 'fresh')
    restoreFrom(dest, fresh)
    expect(readFileSync(join(fresh, 'deskmail.db'), 'utf-8')).toBe('DBDATA-v1')
    expect(readFileSync(join(fresh, 'attachments', 'a.txt'), 'utf-8')).toBe('hello')
  })
})
