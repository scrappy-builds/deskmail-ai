import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { createFolder, ensureStandardFolders, findFolderByRole, getFolder, listFolders, moveFolder, upsertFolder } from '../../src/db/folders'

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

  // A prefixed-namespace server (Dovecot 'INBOX.Sent') must adopt the pre-sync
  // placeholder rather than create a second 'sent' row that findFolderByRole
  // would then resolve to instead of the real, populated mailbox.
  it('adopts the placeholder when a prefixed-namespace folder syncs', () => {
    const placeholderSent = findFolderByRole(db, accountId, 'sent')!.id
    const synced = upsertFolder(db, accountId, 'Sent', 'sent', 'INBOX.Sent')
    expect(synced).toBe(placeholderSent) // same row, not a duplicate
    const sentRows = listFolders(db, accountId).filter((f) => f.role === 'sent')
    expect(sentRows).toHaveLength(1)
    expect(findFolderByRole(db, accountId, 'sent')!.remote_path).toBe('INBOX.Sent')
  })

  // A custom folder nested under the Inbox stores a bare remote_path ('Receipts').
  // When a prefixed-namespace server later reports it as 'INBOX.Receipts', sync
  // must adopt the nested row (keeping it under the Inbox), not spawn a duplicate
  // top-level folder.
  it('adopts a nested custom folder instead of duplicating it to top level', () => {
    const nested = createFolder(db, accountId, 'Receipts', inboxId)
    const synced = upsertFolder(db, accountId, 'Receipts', null, 'INBOX.Receipts')
    expect(synced).toBe(nested) // same row, not a duplicate
    const receipts = listFolders(db, accountId).filter((f) => f.name.toLowerCase() === 'receipts')
    expect(receipts).toHaveLength(1)
    expect(receipts[0].parentId).toBe(inboxId) // stayed nested under the Inbox
    expect(getFolder(db, nested)!.remote_path).toBe('INBOX.Receipts') // adopted the server path
  })

  // Two genuinely distinct server folders that happen to share a leaf name (under
  // different server paths) must stay separate — the bare-path guard prevents the
  // adoption from collapsing them.
  it('does not collapse two distinct server folders with the same leaf name', () => {
    const a = upsertFolder(db, accountId, 'Notes', null, 'INBOX.Work.Notes')
    const b = upsertFolder(db, accountId, 'Notes', null, 'INBOX.Home.Notes')
    expect(b).not.toBe(a)
    expect(listFolders(db, accountId).filter((f) => f.name === 'Notes')).toHaveLength(2)
  })
})
