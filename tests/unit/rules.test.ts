import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { applyRulesToMessage, createRule, listRules, ruleMatches } from '../../src/db/rules'
import { createLabel, labelsForMessage } from '../../src/db/labels'
import { ensureStandardFolders, listFolders } from '../../src/db/folders'
import { insertAccount } from '../../src/db/accounts'
import { getMessage, upsertMessage } from '../../src/db/messages'
import type { AccountInput, Rule } from '../../src/shared/db'

const rule = (over: Partial<Rule>): Rule => ({
  id: 1, name: 'r', enabled: true, field: 'from', op: 'contains', value: 'maya',
  action: 'star', targetFolderId: null, targetLabelId: null, ...over
})

describe('rule matching (pure)', () => {
  const msg = { from: 'Maya Chen maya@northwind.studio', subject: 'Q3 launch', to: 'alex@x', body: 'the plan' }
  it('contains / equals / startswith, case-insensitive', () => {
    expect(ruleMatches(rule({ field: 'from', op: 'contains', value: 'MAYA' }), msg)).toBe(true)
    expect(ruleMatches(rule({ field: 'subject', op: 'startswith', value: 'q3' }), msg)).toBe(true)
    expect(ruleMatches(rule({ field: 'subject', op: 'equals', value: 'q3 launch' }), msg)).toBe(true)
    expect(ruleMatches(rule({ field: 'body', op: 'contains', value: 'invoice' }), msg)).toBe(false)
  })
  it('a blank value never matches', () => {
    expect(ruleMatches(rule({ value: '  ' }), msg)).toBe(false)
  })
})

describe('applyRulesToMessage', () => {
  let dir: string
  let db: DB
  const base: AccountInput = {
    displayName: 'J', emailAddress: 'j@x', incomingType: 'imap', incomingHost: 'h', incomingPort: 993,
    incomingSecurity: 'ssl', outgoingHost: 'h', outgoingPort: 465, outgoingSecurity: 'ssl', username: 'u', password: 'p'
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-rules-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('applies a matching rule (label) and skips a non-match', () => {
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    const work = createLabel(db, 'Work')
    createRule(db, { name: 'tag maya', enabled: true, field: 'from', op: 'contains', value: 'maya', action: 'label', targetFolderId: null, targetLabelId: work })

    const hit = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 1, messageIdHeader: null, fromName: 'Maya', fromEmail: 'maya@x',
      to: [], cc: [], bcc: [], subject: 's', snippet: null, bodyText: null, bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    })
    const miss = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 2, messageIdHeader: null, fromName: 'Bob', fromEmail: 'bob@x',
      to: [], cc: [], bcc: [], subject: 's', snippet: null, bodyText: null, bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    })
    applyRulesToMessage(db, hit)
    applyRulesToMessage(db, miss)

    expect(labelsForMessage(db, hit).map((l) => l.name)).toEqual(['Work'])
    expect(labelsForMessage(db, miss)).toHaveLength(0)
  })

  it('a star rule flags the message', () => {
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    createRule(db, { name: 'star invoices', enabled: true, field: 'subject', op: 'contains', value: 'invoice', action: 'star', targetFolderId: null, targetLabelId: null })
    const id = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 1, messageIdHeader: null, fromName: null, fromEmail: 'x@y',
      to: [], cc: [], bcc: [], subject: 'Your invoice', snippet: null, bodyText: null, bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    })
    applyRulesToMessage(db, id)
    expect(getMessage(db, id)?.isStarred).toBe(true)
    expect(listRules(db)).toHaveLength(1)
  })

  it('disabled rules are ignored', () => {
    const acc = insertAccount(db, base)
    ensureStandardFolders(db, acc)
    const inbox = listFolders(db, acc).find((f) => f.role === 'inbox')!.id
    createRule(db, { name: 'off', enabled: false, field: 'subject', op: 'contains', value: 'invoice', action: 'star', targetFolderId: null, targetLabelId: null })
    const id = upsertMessage(db, {
      accountId: acc, folderId: inbox, remoteUid: 1, messageIdHeader: null, fromName: null, fromEmail: 'x@y',
      to: [], cc: [], bcc: [], subject: 'Your invoice', snippet: null, bodyText: null, bodyHtml: null, receivedAt: null, sentAt: null, isRead: false, isStarred: false
    })
    applyRulesToMessage(db, id)
    expect(getMessage(db, id)?.isStarred).toBe(false)
  })
})
