import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { searchMessages } from '../../src/db/messages'
import { ingestRaw } from '../../src/main/mail/ingest'

function seed(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Me','me@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','me@example.com')`
  )
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
}
function raw(from: string, subject: string, body: string, uid: number): { uid: number; text: string } {
  return {
    uid,
    text: [
      `From: ${from}`,
      'To: me@example.com',
      `Subject: ${subject}`,
      'Date: Tue, 07 Jul 2026 09:00:00 +0100',
      `Message-ID: <${uid}@x>`,
      '',
      body,
      ''
    ].join('\r\n')
  }
}

describe('local search', () => {
  let dir: string
  let db: DB
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-search-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seed(db)
    const msgs = [
      raw('"Maya Chen" <maya@northwind.studio>', 'Q3 launch timeline', 'the print run window shifts', 1),
      raw('"Stripe" <receipts@stripe.com>', 'Your invoice for June', 'Invoice INV-2041 for the studio', 2),
      raw('"Priya Nair" <priya@makerspace.uk>', 'Radiator clip licence', 'non-commercial clause question', 3)
    ]
    for (const m of msgs) await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: m.uid, isRead: false, isStarred: false }, m.text)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('matches on subject', () => {
    const r = searchMessages(db, 'launch')
    expect(r.map((m) => m.subject)).toEqual(['Q3 launch timeline'])
  })

  it('matches on sender', () => {
    expect(searchMessages(db, 'stripe').map((m) => m.subject)).toEqual(['Your invoice for June'])
  })

  it('matches on body text', () => {
    expect(searchMessages(db, 'clause').map((m) => m.subject)).toEqual(['Radiator clip licence'])
  })

  it('requires all terms (AND) and is case-insensitive', () => {
    expect(searchMessages(db, 'INVOICE studio')).toHaveLength(1)
    expect(searchMessages(db, 'invoice launch')).toHaveLength(0)
  })

  it('returns nothing for an empty query', () => {
    expect(searchMessages(db, '   ')).toHaveLength(0)
  })
})
