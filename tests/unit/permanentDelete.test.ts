import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { insertAccount } from '../../src/db/accounts'
import { ensureStandardFolders, findFolderByRole } from '../../src/db/folders'
import { listMessages, markFolderRead, upsertMessage } from '../../src/db/messages'
import { applyAction, emptyFolder, pendingActions } from '../../src/db/mailActions'
import type { AccountInput } from '../../src/shared/db'

const base: AccountInput = {
  displayName: 'T', emailAddress: 't@e.st', incomingType: 'imap', incomingHost: 'h', incomingPort: 993,
  incomingSecurity: 'ssl', outgoingHost: 'h', outgoingPort: 465, outgoingSecurity: 'ssl', username: 't@e.st', password: 'x'
}

function addMsg(db: DB, folderId: number, uid: number, read = false): number {
  return upsertMessage(db, {
    accountId: 1, folderId, remoteUid: uid, messageIdHeader: null, fromName: null, fromEmail: null,
    to: [], cc: [], bcc: [], subject: `m${uid}`, snippet: null, bodyText: null, bodyHtml: null,
    receivedAt: null, sentAt: null, isRead: read, isStarred: false
  })
}

describe('mark-all-read + permanent delete', () => {
  let dir: string, db: DB, inboxId: number, trashId: number
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-del-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    insertAccount(db, base)
    ensureStandardFolders(db, 1)
    inboxId = findFolderByRole(db, 1, 'inbox')!.id
    trashId = findFolderByRole(db, 1, 'trash')!.id
  })
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

  it('marks every unread message in a folder read', () => {
    addMsg(db, inboxId, 1); addMsg(db, inboxId, 2); addMsg(db, inboxId, 3, true)
    expect(markFolderRead(db, inboxId)).toBe(2) // two were unread
    expect(listMessages(db, inboxId).every((m) => m.isRead)).toBe(true)
  })

  it('delete-forever removes the local row and queues a server expunge', () => {
    const id = addMsg(db, trashId, 7)
    expect(applyAction(db, id, 'delete-forever')).toBe(true)
    expect(listMessages(db, trashId)).toHaveLength(0) // gone locally
    const queued = pendingActions(db)
    expect(queued).toHaveLength(1)
    expect(queued[0].op).toBe('delete-forever')
    expect(queued[0].remote_uid).toBe(7)
    expect(queued[0].source_path).toBe('Trash') // so the drainer can expunge after the row is gone
  })

  it('emptyFolder permanently deletes every message in the folder', () => {
    addMsg(db, trashId, 1); addMsg(db, trashId, 2); addMsg(db, trashId, 3)
    expect(emptyFolder(db, trashId)).toBe(3)
    expect(listMessages(db, trashId)).toHaveLength(0)
    expect(pendingActions(db).filter((a) => a.op === 'delete-forever')).toHaveLength(3)
  })
})
