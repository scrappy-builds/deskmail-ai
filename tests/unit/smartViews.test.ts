import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { buildSmartViewWhere, createSmartView, listSmartViews, runSmartView } from '../../src/db/smartViews'
import { insertAccount } from '../../src/db/accounts'
import { ensureStandardFolders, listFolders } from '../../src/db/folders'
import { setMuted, upsertMessage } from '../../src/db/messages'
import type { AccountInput } from '../../src/shared/db'

const base: AccountInput = {
  displayName: 'J', emailAddress: 'j@x', incomingType: 'imap', incomingHost: 'h', incomingPort: 993,
  incomingSecurity: 'ssl', outgoingHost: 'h', outgoingPort: 465, outgoingSecurity: 'ssl', username: 'u', password: 'p'
}

describe('smart view WHERE builder (pure)', () => {
  it('joins conditions with AND (all) or OR (any) and always excludes muted', () => {
    const all = buildSmartViewWhere({ name: 'x', match: 'all', conditions: [{ field: 'subject', op: 'contains', value: 'invoice' }, { field: 'unread', op: 'contains', value: '' }] })
    expect(all.clause).toContain(' AND ')
    expect(all.clause).toContain('is_muted = 0')
    const any = buildSmartViewWhere({ name: 'x', match: 'any', conditions: [{ field: 'from', op: 'contains', value: 'maya' }, { field: 'starred', op: 'contains', value: '' }] })
    expect(any.clause).toContain(' OR ')
  })
})

describe('runSmartView', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-sv-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns messages matching all conditions and honours mute', () => {
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const mk = (uid: number, subject: string, from: string, unread: boolean): number =>
      upsertMessage(db, { accountId: acc, folderId: inbox, remoteUid: uid, messageIdHeader: null, fromName: from, fromEmail: `${from}@x`, to: [], cc: [], bcc: [], subject, snippet: null, bodyText: null, bodyHtml: null, receivedAt: `2026-07-0${uid}T00:00:00Z`, sentAt: null, isRead: !unread, isStarred: false })

    const hit = mk(1, 'June invoice', 'maya', true)
    mk(2, 'June invoice', 'maya', false) // read → excluded by unread cond
    mk(3, 'lunch', 'maya', true) // subject doesn't match

    const id = createSmartView(db, { name: 'Unread invoices', match: 'all', conditions: [{ field: 'subject', op: 'contains', value: 'invoice' }, { field: 'unread', op: 'contains', value: '' }] })
    expect(listSmartViews(db)).toHaveLength(1)
    expect(runSmartView(db, id).map((m) => m.id)).toEqual([hit])

    setMuted(db, hit, true) // muting removes it from the view
    expect(runSmartView(db, id)).toHaveLength(0)
  })
})
