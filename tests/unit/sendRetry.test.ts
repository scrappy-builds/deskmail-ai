import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { dueScheduled, listScheduled, recordSendFailure, retryDelayMinutes, retryScheduled, scheduleSend } from '../../src/db/scheduledSends'

const PAYLOAD = { accountId: 1, to: ['x@y.com'], cc: [], bcc: [], subject: 'hi', bodyHtml: '<p>x</p>' }

describe('send retry with backoff', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-retry-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('J','j@x.com','imap','h',993,'ssl','s',465,'ssl','j')`
    )
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('backoff schedule: 1, 5, 30, 30 minutes then out of retries', () => {
    expect(retryDelayMinutes(1)).toBe(1)
    expect(retryDelayMinutes(2)).toBe(5)
    expect(retryDelayMinutes(3)).toBe(30)
    expect(retryDelayMinutes(4)).toBe(30)
    expect(retryDelayMinutes(5)).toBeNull()
  })

  it('a failed row waits out its backoff before being due again', () => {
    const now = Date.parse('2026-07-10T10:00:00Z')
    const { id } = scheduleSend(db, PAYLOAD, '2026-07-10T09:59:00Z')
    expect(dueScheduled(db, '2026-07-10T10:00:00Z')).toHaveLength(1)

    const r = recordSendFailure(db, id, 'SMTP down', now)
    expect(r.final).toBe(false)
    // 30 seconds later: still backing off. 61 seconds later: due again.
    expect(dueScheduled(db, '2026-07-10T10:00:30Z')).toHaveLength(0)
    expect(dueScheduled(db, '2026-07-10T10:01:01Z')).toHaveLength(1)
  })

  it('the 5th failure lands on error and lists in the Outbox with its reason', () => {
    const { id } = scheduleSend(db, PAYLOAD, '2020-01-01T00:00:00Z')
    for (let i = 0; i < 4; i++) expect(recordSendFailure(db, id, 'no route').final).toBe(false)
    expect(recordSendFailure(db, id, 'no route to host').final).toBe(true)

    const listed = listScheduled(db)
    expect(listed).toHaveLength(1)
    expect(listed[0].status).toBe('error')
    expect(listed[0].attempts).toBe(5)
    expect(listed[0].lastError).toBe('no route to host')
    // ...and is never picked up by the sender again.
    expect(dueScheduled(db, '2099-01-01T00:00:00Z')).toHaveLength(0)
  })

  it('Retry now re-queues with fresh attempts', () => {
    const { id } = scheduleSend(db, PAYLOAD, '2020-01-01T00:00:00Z')
    for (let i = 0; i < 5; i++) recordSendFailure(db, id, 'x')
    retryScheduled(db, id)
    const due = dueScheduled(db, new Date(Date.now() + 1000).toISOString())
    expect(due).toHaveLength(1)
    expect(due[0].attempts).toBe(0)
    expect(due[0].status).toBe('scheduled')
  })
})
