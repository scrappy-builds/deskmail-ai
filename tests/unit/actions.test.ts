import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { ingestRaw } from '../../src/main/mail/ingest'
import { applyAction, pendingActions } from '../../src/db/mailActions'
import { getMessage, listMessages } from '../../src/db/messages'

function seed(db: DB): { inbox: number; archive: number; junk: number; trash: number } {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Me','me@x','imap','imap.x',993,'ssl','smtp.x',465,'ssl','me@x')`
  )
  const mk = (name: string, role: string, path: string): number => {
    db.run('INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,?,?,?)', [name, role, path])
    return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  }
  return { inbox: mk('Inbox', 'inbox', 'INBOX'), archive: mk('Archive', 'archive', 'Archive'), junk: mk('Junk', 'junk', 'Junk'), trash: mk('Bin', 'trash', 'Trash') }
}
const raw = (subj: string, uid: number): string =>
  ['From: a@x', 'To: me@x', 'Subject: ' + subj, 'Date: Tue, 07 Jul 2026 09:00:00 +0100', `Message-ID: <${uid}@x>`, '', 'body', ''].join('\r\n')

describe('mail actions (local + queue)', () => {
  let dir: string
  let db: DB
  let f: ReturnType<typeof seed>
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-act-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    f = seed(db)
    await ingestRaw(db, { accountId: 1, folderId: f.inbox, remoteUid: 42, isRead: false, isStarred: false }, raw('Hello', 42))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('archive moves the message out of the inbox and queues an IMAP move', () => {
    expect(listMessages(db, f.inbox)).toHaveLength(1)
    applyAction(db, 1, 'archive')
    expect(listMessages(db, f.inbox)).toHaveLength(0)
    expect(listMessages(db, f.archive)).toHaveLength(1)
    const q = pendingActions(db)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ op: 'archive', remote_uid: 42, source_path: 'INBOX', target_path: 'Archive' })
  })

  it('trash = move to Trash (reversible), junk = move to Junk', () => {
    applyAction(db, 1, 'trash')
    expect(listMessages(db, f.trash)).toHaveLength(1)
    // move it back to inbox by explicit move
    applyAction(db, 1, 'move', f.inbox)
    expect(listMessages(db, f.inbox)).toHaveLength(1)
    applyAction(db, 1, 'junk')
    expect(listMessages(db, f.junk)).toHaveLength(1)
  })

  it('flag / read toggle local state and queue flag ops', () => {
    applyAction(db, 1, 'flag')
    expect(getMessage(db, 1)!.isStarred).toBe(true)
    applyAction(db, 1, 'read')
    expect(getMessage(db, 1)!.isRead).toBe(true)
    applyAction(db, 1, 'unread')
    expect(getMessage(db, 1)!.isRead).toBe(false)
    expect(pendingActions(db).map((a) => a.op)).toEqual(['flag', 'read', 'unread'])
  })

  it('creates the target role folder if missing', async () => {
    const d2 = mkdtempSync(join(tmpdir(), 'deskmail-act2-'))
    const db2 = openDatabase(join(d2, 'deskmail.db'))
    db2.run(`INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port, incoming_security, outgoing_host, outgoing_port, outgoing_security, username) VALUES ('Me','me@x','imap','imap.x',993,'ssl','smtp.x',465,'ssl','me@x')`)
    db2.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
    await ingestRaw(db2, { accountId: 1, folderId: 1, remoteUid: 7, isRead: false, isStarred: false }, raw('Hi', 7))
    applyAction(db2, 1, 'junk')
    const junk = db2.get("SELECT id FROM folders WHERE role='junk'") as { id: number } | undefined
    expect(junk).toBeTruthy()
    db2.close()
    rmSync(d2, { recursive: true, force: true })
  })
})
