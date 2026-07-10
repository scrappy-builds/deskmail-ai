import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { createFolder, ensureStandardFolders, findFolderByRole, listFolders, moveFolder } from '../../src/db/folders'

// Insert the bare minimum account so folders (account_id NOT NULL) can be created.
function seedAccount(db: DB): number {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Test', 't@e.st', 'imap', 'h', 993, 'ssl', 'h', 465, 'ssl', 't@e.st')`
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

describe('folders: subfolders inside the Inbox', () => {
  let dir: string
  let db: DB
  let accountId: number
  let inboxId: number
  let junkId: number
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-folders-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    accountId = seedAccount(db)
    ensureStandardFolders(db, accountId)
    inboxId = findFolderByRole(db, accountId, 'inbox')!.id
    junkId = findFolderByRole(db, accountId, 'junk')!.id
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a custom folder nested under the Inbox', () => {
    const id = createFolder(db, accountId, 'Receipts', inboxId)
    const row = listFolders(db, accountId).find((f) => f.id === id)
    expect(row?.parentId).toBe(inboxId)
  })

  it('moves an existing custom folder into the Inbox', () => {
    const id = createFolder(db, accountId, 'Receipts') // top-level
    moveFolder(db, id, inboxId)
    expect(listFolders(db, accountId).find((f) => f.id === id)?.parentId).toBe(inboxId)
  })

  it('refuses to nest a folder under a non-Inbox standard mailbox', () => {
    const id = createFolder(db, accountId, 'Receipts')
    expect(() => moveFolder(db, id, junkId)).toThrow(/Inbox/)
  })
})
