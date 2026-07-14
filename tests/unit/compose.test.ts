import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { getDraft, listDrafts, saveDraft } from '../../src/db/drafts'
import { cancelScheduled, listScheduled, scheduleSend } from '../../src/db/scheduledSends'
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

  // These use realistic *post-editor* HTML: TipTap drops any HTML comment but keeps
  // the <hr> separator and <blockquote>, so the signature is placed just above that
  // boundary — not via a marker (which wouldn't survive the editor).
  it('on a reply, puts the signature under the new text and above the separator/quote', () => {
    const reply: ComposePayload = { ...PAYLOAD, bodyHtml: '<p>My reply</p><hr><p>On … wrote:</p><blockquote><p>the original</p></blockquote>' }
    const mail = buildMail({ payload: reply, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    const html = mail.html as string
    // order: reply text → signature → <hr> → quoted original
    expect(html.indexOf('My reply')).toBeLessThan(html.indexOf('Thanks,<br>Alex'))
    expect(html.indexOf('Thanks,<br>Alex')).toBeLessThan(html.indexOf('<hr'))
    expect(html.indexOf('Thanks,<br>Alex')).toBeLessThan(html.indexOf('the original'))
  })

  it('on a forward, the signature sits above the separator and forwarded header', () => {
    const fwd: ComposePayload = { ...PAYLOAD, bodyHtml: '<p>FYI</p><hr><p>Forwarded message</p><blockquote><p>orig</p></blockquote>' }
    const mail = buildMail({ payload: fwd, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    const html = mail.html as string
    expect(html.indexOf('FYI')).toBeLessThan(html.indexOf('Thanks,<br>Alex'))
    expect(html.indexOf('Thanks,<br>Alex')).toBeLessThan(html.indexOf('<hr'))
    expect(html.indexOf('Thanks,<br>Alex')).toBeLessThan(html.indexOf('Forwarded message'))
  })

  it('new mail (no quote) appends the signature at the end', () => {
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    const html = mail.html as string
    expect(html.indexOf('parts are ready')).toBeLessThan(html.indexOf('Thanks,<br>Alex'))
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

  // A "Send later" message lives as a draft + a scheduled_sends row. It belongs in
  // the Outbox, not both places — so it must drop out of the Drafts list while
  // queued, and come back if the send is cancelled.
  it('hides a queued draft from the Drafts list, but keeps it in the Outbox', () => {
    saveDraft(db, { ...PAYLOAD, subject: 'A real draft' })
    const { id } = scheduleSend(db, { ...PAYLOAD, subject: 'Queued to send' }, new Date(Date.now() + 3600_000).toISOString())

    // Drafts shows only the genuine draft; the Outbox carries the queued one with body.
    expect(listDrafts(db).map((d) => d.subject)).toEqual(['A real draft'])
    const outbox = listScheduled(db)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].subject).toBe('Queued to send')
    expect(outbox[0].bodyHtml).toContain('parts are ready')

    // Cancelling deletes the backing draft, so neither view keeps it.
    cancelScheduled(db, id)
    expect(listDrafts(db).map((d) => d.subject)).toEqual(['A real draft'])
    expect(listScheduled(db)).toHaveLength(0)
  })

  it('creates a default signature once per account', () => {
    ensureDefaultSignature(db, 1, 'Alex')
    ensureDefaultSignature(db, 1, 'Alex')
    expect(getDefaultSignature(db, 1)).toBe('Thanks,\nAlex')
    expect((db.get('SELECT COUNT(*) c FROM signatures') as { c: number }).c).toBe(1)
  })
})
