import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { openDatabase, runMigrations } from '../../src/db/database'
import { loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty } from '../../src/db/settings'
import { getAccount, insertAccount, updateAccount } from '../../src/db/accounts'
import { createFolder, deleteFolder, ensureStandardFolders, listFolders, moveFolder, renameFolder, reorderFolders, upsertFolder } from '../../src/db/folders'
import { addAttachment, listMessages, listMessagesByLabel, setMuted, setPinned, upsertMessage } from '../../src/db/messages'
import { createLabel, deleteLabel, labelsForMessage, listLabels, setMessageLabel } from '../../src/db/labels'
import { createContact, deleteContact, listContactGroups, listContactsDetail, updateContact } from '../../src/db/contacts'
import { getTodayAgenda } from '../../src/db/today'
import { DEFAULT_LAYOUT } from '../../src/shared/layout'
import type { AccountInput } from '../../src/shared/db'

const EXPECTED_TABLES = [
  'accounts', 'credentials', 'folders', 'messages', 'attachments', 'drafts', 'labels',
  'message_labels', 'sync_state', 'layout_preferences', 'app_settings', 'signatures',
  'scheduled_sends', 'snoozes', 'templates', 'contacts', 'events', 'event_attendees', 'mail_actions'
]

describe('database migrations', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates every table and sets user_version', () => {
    const db = openDatabase(file)
    const version = (db.get('PRAGMA user_version') as { user_version: number }).user_version
    expect(version).toBe(16)

    const rows = db.all("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[]
    const names = rows.map((r) => r.name)
    for (const t of EXPECTED_TABLES) expect(names).toContain(t)
    db.close()
  })

  it('is idempotent — re-running migrations changes nothing', () => {
    const db = openDatabase(file)
    runMigrations(db) // again
    const version = (db.get('PRAGMA user_version') as { user_version: number }).user_version
    expect(version).toBe(16)
    db.close()
  })

  it('persists to disk and reopens', () => {
    const db = openDatabase(file)
    db.run("INSERT INTO labels (name, colour) VALUES ('Work', '#1e7a38')")
    db.close()

    const db2 = new Database(file)
    const row = db2.get("SELECT name FROM labels WHERE name='Work'") as { name: string }
    expect(row.name).toBe('Work')
    db2.close()
  })
})

describe('layout preferences store', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('seeds defaults then round-trips changes', () => {
    const db = openDatabase(file)
    seedLayoutIfEmpty(db, null)
    expect(loadLayoutPrefs(db)).toEqual(DEFAULT_LAYOUT)

    saveLayoutPrefs(db, { ...DEFAULT_LAYOUT, theme: 'dark', sidebarMode: 'icons', previewLineCount: 0 })
    const loaded = loadLayoutPrefs(db)
    expect(loaded.theme).toBe('dark')
    expect(loaded.sidebarMode).toBe('icons')
    expect(loaded.previewLineCount).toBe(0)
    db.close()
  })

  it('imports a legacy settings object on first seed', () => {
    const db = openDatabase(file)
    seedLayoutIfEmpty(db, { ...DEFAULT_LAYOUT, theme: 'dark' })
    expect(loadLayoutPrefs(db).theme).toBe('dark')
    db.close()
  })
})

describe('accounts insert / get / update', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const base: AccountInput = {
    displayName: 'Jamie', emailAddress: 'jamie@example.com', incomingType: 'imap',
    incomingHost: 'imap.example.com', incomingPort: 993, incomingSecurity: 'ssl',
    outgoingHost: 'smtp.example.com', outgoingPort: 465, outgoingSecurity: 'ssl',
    username: 'jamie@example.com', password: 'secret'
  }

  it('round-trips insert → get (password excluded) → update', () => {
    const db = openDatabase(file)
    const id = insertAccount(db, base)

    const got = getAccount(db, id)
    expect(got).not.toBeNull()
    expect(got?.emailAddress).toBe('jamie@example.com')
    expect(got?.incomingHost).toBe('imap.example.com')
    expect(got?.password).toBe('') // never returned from the DB layer

    updateAccount(db, id, { ...base, incomingHost: 'imap.new.com', incomingPort: 143 })
    const after = getAccount(db, id)
    expect(after?.incomingHost).toBe('imap.new.com')
    expect(after?.incomingPort).toBe(143)

    expect(getAccount(db, 999)).toBeNull()
    db.close()
  })
})

describe('folder tree management', () => {
  let dir: string
  let file: string
  const base: AccountInput = {
    displayName: 'Jamie', emailAddress: 'jamie@example.com', incomingType: 'imap',
    incomingHost: 'imap.example.com', incomingPort: 993, incomingSecurity: 'ssl',
    outgoingHost: 'smtp.example.com', outgoingPort: 465, outgoingSecurity: 'ssl',
    username: 'jamie@example.com', password: 'secret'
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ensures the six standard folders, idempotently', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    ensureStandardFolders(db, acc) // twice — must not duplicate
    const roles = listFolders(db, acc).map((f) => f.role).sort()
    expect(roles).toEqual(['archive', 'drafts', 'inbox', 'junk', 'sent', 'trash'])
    db.close()
  })

  it('creates / renames a custom folder and rejects dupes + standard-folder edits', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)

    const id = createFolder(db, acc, 'Receipts')
    expect(listFolders(db, acc).find((f) => f.id === id)?.role).toBeNull()
    expect(() => createFolder(db, acc, 'receipts')).toThrow() // case-insensitive dupe
    expect(() => createFolder(db, acc, '  ')).toThrow() // blank

    renameFolder(db, id, 'Invoices')
    expect(listFolders(db, acc).find((f) => f.id === id)?.name).toBe('Invoices')

    const inboxId = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    expect(() => renameFolder(db, inboxId, 'Nope')).toThrow() // standard folder protected
    db.close()
  })

  it('deleting a custom folder moves its messages back to Inbox', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inboxId = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const custom = createFolder(db, acc, 'Receipts')
    upsertMessage(db, {
      accountId: acc, folderId: custom, remoteUid: 1, messageIdHeader: null, fromName: null,
      fromEmail: null, to: [], cc: [], bcc: [], subject: 'kept', snippet: null, bodyText: null,
      bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    })

    const moved = deleteFolder(db, custom)
    expect(moved).toBe(1)
    expect(listFolders(db, acc).find((f) => f.id === custom)).toBeUndefined()
    expect(listFolders(db, acc).find((f) => f.role === 'inbox')?.totalCount).toBe(1)

    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!
    expect(() => deleteFolder(db, inbox.id)).toThrow() // standard folder protected
    db.close()
  })

  it('creates a subfolder under a parent, rejects moving a folder into itself, and reorders', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)

    const clients = createFolder(db, acc, 'Clients')
    const norway = createFolder(db, acc, 'Norway', clients)
    expect(listFolders(db, acc).find((f) => f.id === norway)?.parentId).toBe(clients)
    // same name allowed under a different parent
    expect(() => createFolder(db, acc, 'Norway')).not.toThrow()

    expect(() => moveFolder(db, clients, clients)).toThrow() // self-parent
    expect(() => moveFolder(db, clients, norway)).toThrow() // cycle (into own child)
    const inboxId = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    expect(() => moveFolder(db, inboxId, clients)).toThrow() // standard can't move

    const a = createFolder(db, acc, 'AAA')
    const b = createFolder(db, acc, 'BBB')
    reorderFolders(db, [b, a])
    const list = listFolders(db, acc)
    expect(list.find((f) => f.id === b)!.sortOrder).toBe(0)
    expect(list.find((f) => f.id === a)!.sortOrder).toBe(1)
    db.close()
  })

  it('does not duplicate attachments when the same message is ingested twice', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const id = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 7, messageIdHeader: null, fromName: null,
      fromEmail: null, to: [], cc: [], bcc: [], subject: 'has attachment', snippet: null,
      bodyText: null, bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    }, true)
    addAttachment(db, id, 'brief.pdf', 'application/pdf', 1000, null)
    addAttachment(db, id, 'brief.pdf', 'application/pdf', 1000, null) // second sync — must not add
    const rows = db.all('SELECT id FROM attachments WHERE message_id = ?', [id]) as unknown[]
    expect(rows.length).toBe(1)
    db.close()
  })
})

describe('message pin / mute', () => {
  let dir: string
  let file: string
  const base: AccountInput = {
    displayName: 'Jamie', emailAddress: 'jamie@example.com', incomingType: 'imap',
    incomingHost: 'h', incomingPort: 993, incomingSecurity: 'ssl',
    outgoingHost: 'h', outgoingPort: 465, outgoingSecurity: 'ssl', username: 'u', password: 'p'
  }
  const mk = (db: ReturnType<typeof openDatabase>, acc: number, folder: number, uid: number, subject: string, receivedAt: string): number =>
    upsertMessage(db, {
      accountId: acc, folderId: folder, remoteUid: uid, messageIdHeader: null, fromName: null,
      fromEmail: null, to: [], cc: [], bcc: [], subject, snippet: null, bodyText: null,
      bodyHtml: null, receivedAt, sentAt: null, isRead: false, isStarred: false
    })
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('pinned messages float to the top of the folder', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const older = mk(db, acc, inbox, 1, 'older', '2026-07-01T00:00:00Z')
    mk(db, acc, inbox, 2, 'newer', '2026-07-08T00:00:00Z')

    expect(listMessages(db, inbox)[0].subject).toBe('newer') // date order first
    setPinned(db, older, true)
    expect(listMessages(db, inbox)[0].subject).toBe('older') // pinned floats up
    db.close()
  })

  it('muting marks read and drops the message from Today', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const id = mk(db, acc, inbox, 1, 'noisy thread', '2026-07-09T00:00:00Z')

    expect(getTodayAgenda(db, '2026-07-09').messages.some((m) => m.id === id)).toBe(true)
    setMuted(db, id, true)
    expect(getTodayAgenda(db, '2026-07-09').messages.some((m) => m.id === id)).toBe(false)
    expect(listMessages(db, inbox).find((m) => m.id === id)?.isRead).toBe(true) // mute marked it read
    db.close()
  })

  it('Today tuning: a read-but-starred message shows only when starred is included', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const id = mk(db, acc, inbox, 1, 'important', '2026-07-09T00:00:00Z')
    setPinned(db, id, false)
    // Mark read + starred.
    db.run('UPDATE messages SET is_read = 1, is_starred = 1 WHERE id = ?', [id])

    expect(getTodayAgenda(db, '2026-07-09').messages.some((m) => m.id === id)).toBe(false)
    expect(getTodayAgenda(db, '2026-07-09', { includeStarred: true }).messages.some((m) => m.id === id)).toBe(true)
    db.close()
  })
})

describe('labels / tags', () => {
  let dir: string
  let file: string
  const base: AccountInput = {
    displayName: 'Jamie', emailAddress: 'j@x', incomingType: 'imap', incomingHost: 'h', incomingPort: 993,
    incomingSecurity: 'ssl', outgoingHost: 'h', outgoingPort: 465, outgoingSecurity: 'ssl', username: 'u', password: 'p'
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates labels (dedup), tags a message, filters by label, and cascades on delete', () => {
    const db = openDatabase(file)
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const msg = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 1, messageIdHeader: null, fromName: null, fromEmail: null,
      to: [], cc: [], bcc: [], subject: 'hello', snippet: null, bodyText: null, bodyHtml: null,
      receivedAt: '2026-07-09T00:00:00Z', sentAt: null, isRead: false, isStarred: false
    })

    const work = createLabel(db, 'Work')
    expect(() => createLabel(db, 'work')).toThrow() // case-insensitive dedup
    expect(listLabels(db).map((l) => l.name)).toEqual(['Work'])

    setMessageLabel(db, msg, work, true)
    expect(labelsForMessage(db, msg).map((l) => l.name)).toEqual(['Work'])
    expect(listMessagesByLabel(db, work).map((m) => m.id)).toEqual([msg])

    setMessageLabel(db, msg, work, false)
    expect(listMessagesByLabel(db, work)).toHaveLength(0)

    setMessageLabel(db, msg, work, true)
    deleteLabel(db, work) // message_labels rows cascade away
    expect(labelsForMessage(db, msg)).toHaveLength(0)
    db.close()
  })
})

describe('contacts: manual add/edit + groups', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-db-'))
    file = join(dir, 'deskmail.db')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates, edits, groups and deletes a contact', () => {
    const db = openDatabase(file)
    const id = createContact(db, { name: 'Priya', email: 'PRIYA@x.uk', org: 'Makerspace', notes: 'licence', groups: ['Clients'] })
    let c = listContactsDetail(db).find((x) => x.id === id)!
    expect(c.email).toBe('priya@x.uk') // normalised
    expect(c.groups).toEqual(['Clients'])
    expect(listContactGroups(db)).toEqual(['Clients'])

    updateContact(db, id, { name: 'Priya Nair', email: 'priya@x.uk', org: 'Makerspace', notes: '', groups: ['Clients', 'Suppliers'] })
    c = listContactsDetail(db).find((x) => x.id === id)!
    expect(c.name).toBe('Priya Nair')
    expect(listContactGroups(db)).toEqual(['Clients', 'Suppliers'])

    deleteContact(db, id)
    expect(listContactsDetail(db).find((x) => x.id === id)).toBeUndefined()
    db.close()
  })
})
