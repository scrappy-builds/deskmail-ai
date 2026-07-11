import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { getDraft, listDrafts, saveDraft } from '../../src/db/drafts'
import { ensureDefaultSignature, getDefaultSignature } from '../../src/db/signatures'
import { buildMail } from '../../src/main/mail/send'
import type { ComposePayload } from '../../src/shared/db'

const PAYLOAD: ComposePayload = {
  accountId: 1,
  to: ['a@example.com', 'b@example.com'],
  cc: ['c@example.com'],
  bcc: [],
  subject: 'Hello',
  bodyHtml: '<p>Morning — the parts are ready.</p>'
}

describe('buildMail', () => {
  it('maps recipients, subject and body', () => {
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Alex Doe', fromEmail: 'alex@example.com', signature: null })
    expect(mail.from).toBe('"Alex Doe" <alex@example.com>')
    expect(mail.to).toBe('a@example.com, b@example.com')
    expect(mail.cc).toBe('c@example.com')
    expect(mail.bcc).toBeUndefined()
    expect(mail.subject).toBe('Hello')
    expect(mail.html).toContain('parts are ready')
  })

  it('appends the signature to the body', () => {
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    expect(mail.html).toContain('Thanks,<br>Alex')
  })

  it('keeps a rich (HTML) signature as-is, but escapes a plain-text one', () => {
    // Rich signatures (bold/links) are preserved.
    const rich = buildMail({ payload: PAYLOAD, fromName: 'Alex', fromEmail: 'j@x', signature: '<b>Alex</b>' })
    expect(rich.html).toContain('<b>Alex</b>')
    // A legacy plain-text signature with stray angle brackets is still escaped.
    const plain = buildMail({ payload: PAYLOAD, fromName: 'Alex', fromEmail: 'j@x', signature: 'a < b' })
    expect(plain.html).toContain('a &lt; b')
  })
})

describe('drafts + signatures', () => {
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

  it('persists a draft and reads it back', () => {
    const id = saveDraft(db, PAYLOAD)
    const d = getDraft(db, id)
    expect(d).not.toBeNull()
    expect(d!.subject).toBe('Hello')
    expect(d!.to).toEqual(['a@example.com', 'b@example.com'])
    expect(listDrafts(db)).toHaveLength(1)
  })

  it('updates an existing draft instead of duplicating', () => {
    const id = saveDraft(db, PAYLOAD)
    saveDraft(db, { ...PAYLOAD, draftId: id, subject: 'Hello (edited)' })
    expect(listDrafts(db)).toHaveLength(1)
    expect(getDraft(db, id)!.subject).toBe('Hello (edited)')
  })

  it('creates a default signature once per account', () => {
    ensureDefaultSignature(db, 1, 'Alex')
    ensureDefaultSignature(db, 1, 'Alex')
    expect(getDefaultSignature(db, 1)).toBe('Thanks,\nAlex')
    expect((db.get('SELECT COUNT(*) c FROM signatures') as { c: number }).c).toBe(1)
  })
})
