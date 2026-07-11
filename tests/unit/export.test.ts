import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { ingestRaw } from '../../src/main/mail/ingest'
import { setAttachmentPath, listAttachmentRows } from '../../src/db/messages'
import { exportForNotebookLM } from '../../src/mcp/export'

function seed(db: DB): void {
  db.run(`INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port, incoming_security, outgoing_host, outgoing_port, outgoing_security, username) VALUES ('Me','me@x','imap','imap.x',993,'ssl','smtp.x',465,'ssl','me@x')`)
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
}
const RAW = [
  'From: "Maya Chen" <maya@northwind.studio>',
  'To: alex@example.com',
  'Subject: Q3 launch timeline',
  'Date: Tue, 07 Jul 2026 09:41:00 +0100',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="MIX"',
  '', '--MIX', 'Content-Type: text/plain', '', 'The dates shifted after the infra review.',
  '--MIX', 'Content-Type: text/plain; name="note.txt"', 'Content-Disposition: attachment; filename="note.txt"', 'Content-Transfer-Encoding: base64', '', 'aGVsbG8=', '--MIX--', ''
].join('\r\n')

describe('exportForNotebookLM', () => {
  let dir: string
  let db: DB
  let base: string
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-exp-'))
    base = join(dir, 'userdata')
    db = openDatabase(join(dir, 'deskmail.db'))
    seed(db)
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 1, isRead: false, isStarred: false }, RAW)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes an email.txt with headers + body', () => {
    const r = exportForNotebookLM(db, 1, base, false)
    expect(existsSync(join(r.folder, 'email.txt'))).toBe(true)
    const text = readFileSync(join(r.folder, 'email.txt'), 'utf-8')
    expect(text).toContain('Subject: Q3 launch timeline')
    expect(text).toContain('Maya Chen')
    expect(text).toContain('dates shifted')
    expect(r.files.map((f) => f.name)).toEqual(['email.txt'])
  })

  it('includes downloaded attachments, and notes ones that are missing', () => {
    // No local_path yet → attachment noted as missing.
    const r1 = exportForNotebookLM(db, 1, base, true)
    expect(r1.note).toMatch(/attachment/i)
    expect(r1.files).toHaveLength(1)

    // Simulate a downloaded attachment.
    const attFile = join(dir, 'note.txt')
    writeFileSync(attFile, 'hello')
    const att = listAttachmentRows(db, 1)[0]
    setAttachmentPath(db, att.id, attFile)

    const r2 = exportForNotebookLM(db, 1, base, true)
    expect(r2.files.map((f) => f.name).sort()).toEqual(['email.txt', 'note.txt'])
    expect(r2.note).toBeUndefined()
  })
})
