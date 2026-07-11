import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { countDuplicateMessages, dedupeMessages, searchMessages } from '../../src/db/messages'

function seed(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('A','a@x.com','imap','h',993,'ssl','s',465,'ssl','a'),
            ('B','b@x.com','imap','h',993,'ssl','s',465,'ssl','b')`
  )
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX'), (1,'Sent','sent','Sent'), (2,'Inbox','inbox','INBOX')")
}

function addMsg(db: DB, accountId: number, folderId: number, header: string | null, subject: string): number {
  db.run(
    `INSERT INTO messages (account_id, folder_id, message_id_header, subject, is_read) VALUES (?, ?, ?, ?, 1)`,
    [accountId, folderId, header, subject]
  )
  const id = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  db.run('INSERT INTO messages_fts(rowid, subject, sender, body) VALUES (?, ?, ?, ?)', [id, subject, '', ''])
  return id
}

describe('duplicate message cleanup', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-dedupe-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seed(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('collapses same-folder duplicates to the earliest row', () => {
    const keep = addMsg(db, 1, 1, '<m1@x>', 'dupe')
    addMsg(db, 1, 1, '<m1@x>', 'dupe')
    addMsg(db, 1, 1, '<m1@x>', 'dupe')
    expect(countDuplicateMessages(db)).toBe(2)
    expect(dedupeMessages(db).removed).toBe(2)
    const rows = db.all('SELECT id FROM messages') as unknown as { id: number }[]
    expect(rows.map((r) => r.id)).toEqual([keep])
    // FTS ghosts are cleaned too.
    expect(searchMessages(db, 'dupe')).toHaveLength(1)
  })

  it('NULL headers are never touched', () => {
    addMsg(db, 1, 1, null, 'no header')
    addMsg(db, 1, 1, null, 'no header')
    expect(countDuplicateMessages(db)).toBe(0)
    expect(dedupeMessages(db).removed).toBe(0)
  })

  it('same header in different folders (Sent + Inbox) is kept', () => {
    addMsg(db, 1, 1, '<self@x>', 'to myself')
    addMsg(db, 1, 2, '<self@x>', 'to myself')
    expect(countDuplicateMessages(db)).toBe(0)
  })

  it('same header across accounts is kept', () => {
    addMsg(db, 1, 1, '<list@x>', 'list mail')
    addMsg(db, 2, 3, '<list@x>', 'list mail')
    expect(countDuplicateMessages(db)).toBe(0)
  })

  it('refreshes folder counts after removal', () => {
    addMsg(db, 1, 1, '<m2@x>', 'd')
    addMsg(db, 1, 1, '<m2@x>', 'd')
    dedupeMessages(db)
    const f = db.get('SELECT total_count FROM folders WHERE id = 1') as { total_count: number }
    expect(f.total_count).toBe(1)
  })
})
