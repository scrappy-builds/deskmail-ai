import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { getMessage, listMessages } from '../../src/db/messages'
import { ingestRaw } from '../../src/main/mail/ingest'

// Messages FK to accounts + folders, so seed those first (as the real app does).
function seedAccountAndFolder(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Me','me@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','me@example.com')`
  )
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
}

const RAW = [
  'From: "Maya Chen" <maya@northwind.studio>',
  'To: jamie@example.com, team@northwind.studio',
  'Cc: cc@northwind.studio',
  'Subject: Q3 launch timeline',
  'Date: Tue, 07 Jul 2026 09:41:00 +0100',
  'Message-ID: <abc123@northwind.studio>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="MIX"',
  '',
  '--MIX',
  'Content-Type: multipart/alternative; boundary="ALT"',
  '',
  '--ALT',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Sharing the updated launch plan.',
  '--ALT',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Sharing the updated <b>launch plan</b>.</p>',
  '--ALT--',
  '--MIX',
  'Content-Type: text/plain; name="note.txt"',
  'Content-Disposition: attachment; filename="note.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  'aGVsbG8gd29ybGQ=',
  '--MIX--',
  ''
].join('\r\n')

describe('parse-and-ingest', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-ing-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('parses a multipart message with an attachment and stores it', async () => {
    const db = openDatabase(file); seedAccountAndFolder(db)
    const id = await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 42, isRead: false, isStarred: false }, RAW)

    const msg = getMessage(db, id)
    expect(msg).not.toBeNull()
    expect(msg!.subject).toBe('Q3 launch timeline')
    expect(msg!.fromName).toBe('Maya Chen')
    expect(msg!.fromEmail).toBe('maya@northwind.studio')
    expect(msg!.to).toContain('jamie@example.com')
    expect(msg!.to).toContain('team@northwind.studio')
    expect(msg!.cc).toContain('cc@northwind.studio')
    expect(msg!.bodyText).toContain('updated launch plan')
    expect(msg!.bodyHtml).toContain('<b>launch plan</b>')
    expect(msg!.hasAttachments).toBe(true)
    expect(msg!.attachments).toHaveLength(1)
    expect(msg!.attachments[0].filename).toBe('note.txt')
    db.close()
  })

  it('reads from the cache offline (reopen a fresh connection)', async () => {
    const db = openDatabase(file); seedAccountAndFolder(db)
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 42, isRead: false, isStarred: false }, RAW)
    db.close()

    // No network involved — a fresh DB handle still returns the message.
    const db2 = openDatabase(file)
    const list = listMessages(db2, 1)
    expect(list).toHaveLength(1)
    expect(list[0].subject).toBe('Q3 launch timeline')
    db2.close()
  })

  it('re-ingesting the same uid does not duplicate', async () => {
    const db = openDatabase(file); seedAccountAndFolder(db)
    const meta = { accountId: 1, folderId: 1, remoteUid: 42, isRead: false, isStarred: false }
    await ingestRaw(db, meta, RAW)
    await ingestRaw(db, { ...meta, isRead: true }, RAW)
    const list = listMessages(db, 1)
    expect(list).toHaveLength(1)
    expect(list[0].isRead).toBe(true)
    db.close()
  })
})
