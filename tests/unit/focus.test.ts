import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { applyFocusClassification, classifyFocus, isNoReplySender, setMessageFocused } from '../../src/main/mail/focus'
import { isBayesTrained } from '../../src/db/bayes'

const BASE = {
  repliedToSender: false,
  senderMessageCount: 0,
  directToMe: false,
  hasListHeaders: false,
  noReplySender: false,
  bayesScore: null as number | null
}

describe('classifyFocus (pure)', () => {
  it('someone I have replied to is always Focused, even list mail', () => {
    expect(classifyFocus({ ...BASE, repliedToSender: true, hasListHeaders: true })).toBe(true)
  })
  it('list mail and no-reply senders land in Other', () => {
    expect(classifyFocus({ ...BASE, hasListHeaders: true })).toBe(false)
    expect(classifyFocus({ ...BASE, noReplySender: true })).toBe(false)
  })
  it('direct-to-me or a regular correspondent is Focused', () => {
    expect(classifyFocus({ ...BASE, directToMe: true })).toBe(true)
    expect(classifyFocus({ ...BASE, senderMessageCount: 3 })).toBe(true)
  })
  it('Bayes breaks the ties once trained; otherwise benefit of the doubt', () => {
    expect(classifyFocus({ ...BASE, bayesScore: 0.9 })).toBe(false)
    expect(classifyFocus({ ...BASE, bayesScore: 0.1 })).toBe(true)
    expect(classifyFocus(BASE)).toBe(true)
  })
  it('no-reply patterns', () => {
    expect(isNoReplySender('no-reply@shop.example')).toBe(true)
    expect(isNoReplySender('donotreply@x.example')).toBe(true)
    expect(isNoReplySender('maya@northwind.studio')).toBe(false)
    expect(isNoReplySender(null)).toBe(false)
  })
})

describe('focus classification + training on the store', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-focus-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Jamie','jamie@functional3duk.co.uk','imap','h',993,'ssl','s',465,'ssl','j')`
    )
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX'), (1,'Sent','sent','Sent')")
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function addInbox(from: string, opts: { to?: string[]; list?: string; subject?: string } = {}): number {
    db.run(
      `INSERT INTO messages (account_id, folder_id, from_email, to_json, subject, list_unsubscribe) VALUES (1, 1, ?, ?, ?, ?)`,
      [from, JSON.stringify(opts.to ?? []), opts.subject ?? 'hello', opts.list ?? null]
    )
    return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  }

  it('list mail classifies to Other; direct mail stays Focused', () => {
    const listMsg = addInbox('news@list.example', { list: '<mailto:leave@list.example>' })
    const direct = addInbox('maya@northwind.studio', { to: ['jamie@functional3duk.co.uk'] })
    expect(applyFocusClassification(db, listMsg, ['jamie@functional3duk.co.uk'])).toBe(false)
    expect(applyFocusClassification(db, direct, ['jamie@functional3duk.co.uk'])).toBe(true)
    const rows = db.all('SELECT id, is_focused FROM messages ORDER BY id') as unknown as { id: number; is_focused: number }[]
    expect(rows.find((r) => r.id === listMsg)!.is_focused).toBe(0)
    expect(rows.find((r) => r.id === direct)!.is_focused).toBe(1)
  })

  it('a sender in my Sent mail is Focused even with list headers', () => {
    db.run(
      `INSERT INTO messages (account_id, folder_id, from_email, to_json, subject) VALUES (1, 2, 'jamie@functional3duk.co.uk', ?, 'to them')`,
      [JSON.stringify(['friendly@list.example'])]
    )
    const msg = addInbox('friendly@list.example', { list: '<https://list.example/u>' })
    expect(applyFocusClassification(db, msg, ['jamie@functional3duk.co.uk'])).toBe(true)
  })

  it('training flips the flag, feeds the focus Bayes table and future classification', () => {
    // Teach it that "newsletter digest" style mail is Other, three times over.
    for (let i = 0; i < 3; i++) {
      const other = addInbox(`sender${i}@bulk.example`, { subject: 'weekly newsletter digest promotions' })
      setMessageFocused(db, other, false)
      const focused = addInbox(`person${i}@real.example`, { subject: 'bracket order question invoice' })
      setMessageFocused(db, focused, true)
    }
    expect(isBayesTrained(db, 'focus')).toBe(true)
    // Junk counters untouched — the tables are independent.
    expect(isBayesTrained(db, 'junk')).toBe(false)

    const fresh = addInbox('unknown@somewhere.example', { subject: 'weekly newsletter digest promotions' })
    expect(applyFocusClassification(db, fresh, ['jamie@functional3duk.co.uk'])).toBe(false)
  })
})
