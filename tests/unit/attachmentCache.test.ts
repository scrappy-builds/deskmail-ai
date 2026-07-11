import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { sweepAttachmentCache } from '../../src/main/mail/attachments'

describe('attachment cache sweep', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-cache-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('J','j@x.com','imap','h',993,'ssl','s',465,'ssl','j')`
    )
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
    mkdirSync(join(dir, 'files'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  // One cached attachment of `size` bytes downloaded at `when`, on its own message.
  function cached(name: string, size: number, when: string): { attId: number; path: string; messageId: number } {
    db.run('INSERT INTO messages (account_id, folder_id, subject) VALUES (1, 1, ?)', [name])
    const messageId = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
    const path = join(dir, 'files', name)
    writeFileSync(path, Buffer.alloc(size))
    db.run(
      `INSERT INTO attachments (message_id, filename, size, local_path, downloaded_at) VALUES (?, ?, ?, ?, ?)`,
      [messageId, name, size, path, when]
    )
    return { attId: (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id, path, messageId }
  }

  it('evicts oldest-first down to the budget and NULLs the rows', () => {
    const a = cached('a.pdf', 1000, '2026-01-01T00:00:00Z')
    const b = cached('b.pdf', 1000, '2026-02-01T00:00:00Z')
    const c = cached('c.pdf', 1000, '2026-03-01T00:00:00Z')

    const r = sweepAttachmentCache(db, 1500)
    expect(r.evicted).toBe(2)
    expect(r.bytesUsed).toBe(1000)
    expect(existsSync(a.path)).toBe(false)
    expect(existsSync(b.path)).toBe(false)
    expect(existsSync(c.path)).toBe(true)
    const rows = db.all('SELECT id, local_path FROM attachments ORDER BY id') as unknown as { id: number; local_path: string | null }[]
    expect(rows.find((x) => x.id === a.attId)!.local_path).toBeNull()
    expect(rows.find((x) => x.id === c.attId)!.local_path).not.toBeNull()
  })

  it('0 budget = unlimited: nothing evicted', () => {
    cached('a.pdf', 5000, '2026-01-01T00:00:00Z')
    const r = sweepAttachmentCache(db, 0)
    expect(r.evicted).toBe(0)
    expect(r.bytesUsed).toBe(5000)
  })

  it('protected (open) messages are never evicted', () => {
    const a = cached('a.pdf', 1000, '2026-01-01T00:00:00Z')
    const b = cached('b.pdf', 1000, '2026-02-01T00:00:00Z')
    const r = sweepAttachmentCache(db, 500, new Set([a.messageId]))
    expect(existsSync(a.path)).toBe(true)
    expect(existsSync(b.path)).toBe(false)
    expect(r.evicted).toBe(1)
  })

  it('a row whose file vanished is tolerated and cleaned up', () => {
    const a = cached('a.pdf', 1000, '2026-01-01T00:00:00Z')
    rmSync(a.path)
    const r = sweepAttachmentCache(db, 10_000)
    expect(r.bytesUsed).toBe(0)
    const row = db.get('SELECT local_path FROM attachments WHERE id = ?', [a.attId]) as { local_path: string | null }
    expect(row.local_path).toBeNull()
  })
})
