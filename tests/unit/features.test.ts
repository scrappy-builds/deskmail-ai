import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { ensureDefaultSignature, getDefaultSignature, getSignatureData, updateSignature } from '../../src/db/signatures'
import { cancelScheduled, dueScheduled, listScheduled, markSent, scheduleSend } from '../../src/db/scheduledSends'
import { computeSnoozeTime, isSnoozed, snoozeMessage } from '../../src/db/snoozes'
import { listMessages } from '../../src/db/messages'
import { listTemplates, seedTemplatesIfEmpty } from '../../src/db/templates'
import { listContacts, searchContacts, upsertContact } from '../../src/db/contacts'
import { getTodayAgenda } from '../../src/db/today'
import { ingestRaw } from '../../src/main/mail/ingest'
import type { ComposePayload } from '../../src/shared/db'

function seedAccountFolder(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Jamie','jamie@f3d.uk','imap','imap.x',993,'ssl','smtp.x',465,'ssl','jamie@f3d.uk')`
  )
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
}
const rawEmail = (from: string, subject: string, uid: number): string =>
  ['From: ' + from, 'To: jamie@f3d.uk', 'Subject: ' + subject, 'Date: Tue, 07 Jul 2026 09:00:00 +0100', `Message-ID: <${uid}@x>`, '', 'body', ''].join('\r\n')

const PAYLOAD: ComposePayload = { accountId: 1, to: ['a@x.com'], cc: [], bcc: [], subject: 'Hi', bodyHtml: '<p>hi</p>' }

describe('Stage 8 features', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-feat-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seedAccountFolder(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('signatures: edit body + append toggle drives what gets appended', () => {
    ensureDefaultSignature(db, 1, 'Jamie')
    expect(getDefaultSignature(db, 1)).toBe('Thanks,\nJamie')
    updateSignature(db, 1, 'Best,\nJamie Bell', true)
    expect(getSignatureData(db, 1)).toMatchObject({ body: 'Best,\nJamie Bell', appendToNew: true })
    updateSignature(db, 1, 'Best,\nJamie Bell', false)
    expect(getDefaultSignature(db, 1)).toBeNull() // append off → nothing appended
  })

  it('scheduled sends: schedule, list, cancel, mark sent, due', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 3600_000).toISOString()
    const { id: futureId } = scheduleSend(db, { ...PAYLOAD, subject: 'Later' }, future)
    const { id: pastId } = scheduleSend(db, { ...PAYLOAD, subject: 'Due' }, past)

    expect(listScheduled(db)).toHaveLength(2)
    expect(dueScheduled(db, new Date().toISOString()).map((s) => s.subject)).toEqual(['Due'])

    cancelScheduled(db, futureId)
    expect(listScheduled(db)).toHaveLength(1)
    markSent(db, pastId)
    expect(listScheduled(db)).toHaveLength(0)
  })

  it('snooze: hides a message until its time, computes quick options', async () => {
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 1, isRead: false, isStarred: false }, rawEmail('a@x.com', 'Hello', 1))
    const now = new Date().toISOString()
    expect(listMessages(db, 1)).toHaveLength(1)
    snoozeMessage(db, 1, new Date(Date.now() + 3600_000).toISOString())
    expect(listMessages(db, 1)).toHaveLength(0)
    expect(isSnoozed(db, 1, now)).toBe(true)
    // A past snooze time means it's visible again.
    snoozeMessage(db, 1, new Date(Date.now() - 1000).toISOString())
    expect(listMessages(db, 1)).toHaveLength(1)
    expect(computeSnoozeTime('tomorrow', new Date('2026-07-09T14:00:00'))).toContain('2026-07-10')
  })

  it('templates: seed a few in Jamie’s voice, once', () => {
    seedTemplatesIfEmpty(db)
    seedTemplatesIfEmpty(db)
    const t = listTemplates(db)
    expect(t).toHaveLength(3)
    expect(t.map((x) => x.name)).toContain('Dispatch note')
    expect(t.find((x) => x.name === 'Commission enquiry reply')?.body).toContain('Jamie')
  })

  it('contacts: auto-collected from mail + searchable', async () => {
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 2, isRead: false, isStarred: false }, rawEmail('"Maya Chen" <maya@northwind.studio>', 'Hi', 2))
    upsertContact(db, 'Priya Nair', 'priya@makerspace.uk')
    expect(listContacts(db).length).toBeGreaterThanOrEqual(2)
    expect(searchContacts(db, 'maya').map((c) => c.email)).toContain('maya@northwind.studio')
  })

  it('today agenda: today’s events + unread mail', async () => {
    db.run("INSERT INTO events (title, date, provider) VALUES ('Standup','2026-07-09','teams')")
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 3, isRead: false, isStarred: false }, rawEmail('a@x.com', 'Unread one', 3))
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 4, isRead: true, isStarred: false }, rawEmail('b@x.com', 'Already read', 4))
    const agenda = getTodayAgenda(db, '2026-07-09')
    expect(agenda.events.map((e) => e.title)).toEqual(['Standup'])
    expect(agenda.messages.map((m) => m.subject)).toContain('Unread one')
    expect(agenda.messages.map((m) => m.subject)).not.toContain('Already read')
  })
})
