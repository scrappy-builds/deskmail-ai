import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { listAllAttachments } from '../../src/db/messages'

describe('all-attachments browser query', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-attbrowse-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('J','j@x.com','imap','h',993,'ssl','s',465,'ssl','j')`
    )
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
    const add = (from: string, subject: string, at: string, files: string[]): void => {
      db.run('INSERT INTO messages (account_id, folder_id, from_email, from_name, subject, received_at) VALUES (1,1,?,?,?,?)', [from, from.split('@')[0], subject, at])
      const mid = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
      for (const f of files) db.run('INSERT INTO attachments (message_id, filename, size) VALUES (?, ?, 100)', [mid, f])
    }
    add('maya@northwind.studio', 'Q3 invoice', '2026-07-01T10:00:00Z', ['invoice-2026-07.pdf'])
    add('alex@supplier.example', 'Filament order', '2026-07-05T10:00:00Z', ['order.pdf', 'photo.jpg'])
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists everything, newest message first', () => {
    const all = listAllAttachments(db)
    expect(all).toHaveLength(3)
    expect(all[0].fromEmail).toBe('alex@supplier.example')
    expect(all.map((a) => a.filename)).toContain('invoice-2026-07.pdf')
  })

  it('filters by filename and by sender', () => {
    expect(listAllAttachments(db, { query: 'invoice' })).toHaveLength(1)
    expect(listAllAttachments(db, { query: 'alex' })).toHaveLength(2)
    expect(listAllAttachments(db, { query: 'nothing-matches' })).toHaveLength(0)
  })

  it('pages with limit/offset', () => {
    const page1 = listAllAttachments(db, { limit: 2, offset: 0 })
    const page2 = listAllAttachments(db, { limit: 2, offset: 2 })
    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(1)
    expect(page1.map((a) => a.attachmentId)).not.toContain(page2[0].attachmentId)
  })
})
