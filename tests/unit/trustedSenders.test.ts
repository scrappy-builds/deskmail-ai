import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { isTrustedSender, listTrustedSenders, trustSender, untrustSender } from '../../src/db/trustedSenders'

describe('trusted senders', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-trust-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips, case-insensitively, and survives duplicates', () => {
    trustSender(db, 'News@Example.COM')
    trustSender(db, 'news@example.com') // duplicate — no error
    expect(isTrustedSender(db, 'NEWS@example.com')).toBe(true)
    expect(isTrustedSender(db, 'other@example.com')).toBe(false)
    expect(isTrustedSender(db, null)).toBe(false)
    expect(listTrustedSenders(db)).toHaveLength(1)

    untrustSender(db, 'news@EXAMPLE.com')
    expect(isTrustedSender(db, 'news@example.com')).toBe(false)
    expect(listTrustedSenders(db)).toHaveLength(0)
  })
})
