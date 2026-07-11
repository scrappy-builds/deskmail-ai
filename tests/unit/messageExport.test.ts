import { describe, expect, it } from 'vitest'
import type { MessageDetail } from '../../src/shared/db'
import { buildEml, buildStandaloneHtml } from '../../src/main/mail/messageExport'

const m: MessageDetail = {
  id: 1, accountId: 1, folderId: 1, fromName: 'Jane Doe', fromEmail: 'jane@ex.com', subject: 'Hi there',
  snippet: null, receivedAt: '2026-07-10T09:00:00Z', isRead: true, isStarred: false, hasAttachments: false,
  isPinned: false, isMuted: false, importance: 'high', to: ['me@ex.com'], cc: [], bcc: [],
  bodyText: 'plain', bodyHtml: '<p>hello</p>', attachments: [], invite: null, folderRole: 'inbox'
}

describe('message export', () => {
  it('builds an RFC822-ish .eml with headers and body', () => {
    const eml = buildEml(m)
    expect(eml).toContain('From: "Jane Doe" <jane@ex.com>')
    expect(eml).toContain('To: me@ex.com')
    expect(eml).toContain('Subject: Hi there')
    expect(eml).toContain('Importance: high')
    expect(eml).toContain('Content-Type: text/html')
    expect(eml).toContain('<p>hello</p>')
  })
  it('builds a self-contained HTML document', () => {
    const html = buildStandaloneHtml(m)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('<p>hello</p>')
  })
})
