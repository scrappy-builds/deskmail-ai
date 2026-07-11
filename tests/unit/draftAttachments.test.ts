import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { getDraft, saveDraft } from '../../src/db/drafts'
import { dueScheduled, markError, scheduleSend } from '../../src/db/scheduledSends'

const PAYLOAD = {
  accountId: null as number | null,
  to: ['maya@northwind.studio'],
  cc: [],
  bcc: [],
  subject: 'Invoice attached',
  bodyHtml: '<p>See attached.</p>',
  attachments: [{ path: 'C:/docs/invoice.pdf', name: 'invoice.pdf', size: 12345 }]
}

describe('draft attachments', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-draft-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Alex','alex@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','alex@example.com')`
    )
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips attachments through save and get', () => {
    const id = saveDraft(db, { ...PAYLOAD, accountId: 1 })
    const d = getDraft(db, id)!
    expect(d.attachments).toHaveLength(1)
    expect(d.attachments[0]).toEqual({ path: 'C:/docs/invoice.pdf', name: 'invoice.pdf', size: 12345 })
  })

  it('updating a draft replaces its attachments', () => {
    const id = saveDraft(db, { ...PAYLOAD, accountId: 1 })
    saveDraft(db, { ...PAYLOAD, accountId: 1, draftId: id, attachments: [] })
    expect(getDraft(db, id)!.attachments).toEqual([])
  })

  it('legacy rows with NULL attachments map to an empty list', () => {
    db.run("INSERT INTO drafts (account_id, to_json, subject, body) VALUES (1, '[]', 'old', '<p>x</p>')")
    const id = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
    expect(getDraft(db, id)!.attachments).toEqual([])
  })

  it('a scheduled send keeps its attachments with the stored draft', () => {
    const { draftId } = scheduleSend(db, { ...PAYLOAD, accountId: 1 }, '2020-01-01T00:00:00Z')
    const due = dueScheduled(db, new Date().toISOString())
    expect(due).toHaveLength(1)
    expect(getDraft(db, due[0].draftId!)!.attachments).toHaveLength(1)
    expect(draftId).toBe(due[0].draftId)
  })

  it('markError records why the send failed', () => {
    const { id } = scheduleSend(db, { ...PAYLOAD, accountId: 1 }, '2020-01-01T00:00:00Z')
    markError(db, id, 'Attachment no longer at C:/docs/invoice.pdf')
    const row = db.get('SELECT status, last_error FROM scheduled_sends WHERE id = ?', [id]) as { status: string; last_error: string }
    expect(row.status).toBe('error')
    expect(row.last_error).toContain('invoice.pdf')
  })
})
