import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { ensureStandardFolders, findFolderByRole } from '../../src/db/folders'
import {
  backfillWindow,
  depthCutoffIso,
  getFolderCursor,
  newMailRange,
  setCursorHigh,
  setCursorLow,
  uidValidityChanged,
  wipeFolderCursor
} from '../../src/db/folderSync'

// --- Pure planning ------------------------------------------------------------

describe('uidValidityChanged', () => {
  it('is false with no stored value (first sync) or when unchanged', () => {
    expect(uidValidityChanged(null, 5)).toBe(false)
    expect(uidValidityChanged(5, 5)).toBe(false)
  })
  it('is true when the server reassigned its UID space', () => {
    expect(uidValidityChanged(5, 9)).toBe(true)
  })
})

describe('newMailRange', () => {
  it('fetches the gap above the cursor when the mailbox grew', () => {
    // uidNext 11 → highest existing UID is 10; we've seen 7 → fetch 8:*
    expect(newMailRange(7, 11)).toBe('8:*')
  })
  it('returns null when nothing new (highest UID already seen)', () => {
    expect(newMailRange(10, 11)).toBeNull()
    expect(newMailRange(10, 10)).toBeNull()
  })
  it('fetches everything from a fresh cursor', () => {
    expect(newMailRange(0, 6)).toBe('1:*')
  })
})

describe('backfillWindow', () => {
  it('returns the page just below the floor', () => {
    expect(backfillWindow(100, 20)).toEqual({ low: 80, high: 99 }) // 80..99 = 20 UIDs
  })
  it('clamps the low end at UID 1', () => {
    expect(backfillWindow(10, 50)).toEqual({ low: 1, high: 9 })
  })
  it('is null when there is nothing left below or no floor yet', () => {
    expect(backfillWindow(1, 20)).toBeNull()
    expect(backfillWindow(null, 20)).toBeNull()
  })
})

describe('depthCutoffIso', () => {
  it('is null for "everything" (0 or negative)', () => {
    expect(depthCutoffIso(0)).toBeNull()
    expect(depthCutoffIso(-5)).toBeNull()
  })
  it('subtracts the given days from now', () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    expect(depthCutoffIso(10, now)).toBe('2026-06-30T00:00:00.000Z')
  })
})

// --- Cursor CRUD --------------------------------------------------------------

describe('folder cursor CRUD', () => {
  let dir: string
  let db: DB
  let inboxId: number
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-fsync-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Test','t@e.st','imap','h',993,'ssl','h',465,'ssl','t@e.st')`
    )
    ensureStandardFolders(db, 1)
    inboxId = findFolderByRole(db, 1, 'inbox')!.id
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeds a cursor with a high-water mark and a back-fill floor', () => {
    setCursorHigh(db, inboxId, 42, 100, 51) // seeded UIDs 51..100
    const c = getFolderCursor(db, inboxId)
    expect(c).toEqual({ folderId: inboxId, uidValidity: 42, lastSeenUid: 100, backfillLowUid: 51 })
  })

  it('climbs last_seen but never raises the floor on later new mail', () => {
    setCursorHigh(db, inboxId, 42, 100, 51)
    setCursorHigh(db, inboxId, 42, 130, 120) // new mail 101..130; floor must stay 51
    const c = getFolderCursor(db, inboxId)!
    expect(c.lastSeenUid).toBe(130)
    expect(c.backfillLowUid).toBe(51)
  })

  it('lowers the floor as back-fill reaches older mail', () => {
    setCursorHigh(db, inboxId, 42, 100, 51)
    setCursorLow(db, inboxId, 31)
    expect(getFolderCursor(db, inboxId)!.backfillLowUid).toBe(31)
  })

  it('wipes the cursor (uidvalidity change)', () => {
    setCursorHigh(db, inboxId, 42, 100, 51)
    wipeFolderCursor(db, inboxId)
    expect(getFolderCursor(db, inboxId)).toBeNull()
  })
})
