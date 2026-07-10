import { describe, expect, it } from 'vitest'
import { buildReplyDraft } from '../../src/renderer/mail/reply'
import { mentionsAttachment } from '../../src/renderer/compose/attachmentReminder'
import type { MessageDetail } from '../../src/shared/db'

const msg: MessageDetail = {
  id: 7, accountId: 1, folderId: 2, fromName: 'Maya', fromEmail: 'maya@x.com',
  subject: 'Re: Launch plan', snippet: null, receivedAt: '2026-07-07T09:00:00Z',
  isRead: true, isStarred: false, hasAttachments: false,
  to: ['jamie@example.com', 'alex@x.com'], cc: ['sam@x.com'], bcc: [],
  bodyText: 'the plan', bodyHtml: '<p>the plan</p>', attachments: [], invite: null
}

describe('reply/forward draft builder', () => {
  it('reply → sender only, single Re: prefix, quoted body, in-reply-to set', () => {
    const d = buildReplyDraft(msg, 'reply', 'jamie@example.com')
    expect(d.to).toEqual(['maya@x.com'])
    expect(d.cc).toEqual([])
    expect(d.subject).toBe('Re: Launch plan') // existing Re: not stacked
    expect(d.bodyHtml).toContain('blockquote')
    expect(d.inReplyToMessageId).toBe(7)
  })

  it('reply-all → everyone except me and the sender, deduped', () => {
    const d = buildReplyDraft(msg, 'replyAll', 'jamie@example.com')
    expect(d.to).toEqual(['maya@x.com'])
    expect(d.cc).toEqual(['alex@x.com', 'sam@x.com']) // jamie (self) + maya (already to) excluded
  })

  it('forward → no recipients, Fwd: prefix, forwarded header', () => {
    const d = buildReplyDraft(msg, 'forward')
    expect(d.to).toEqual([])
    expect(d.subject).toBe('Fwd: Launch plan')
    expect(d.bodyHtml).toContain('Forwarded message')
  })

  it('mentionsAttachment flags forgotten attachments', () => {
    expect(mentionsAttachment('See the attached invoice')).toBe(true)
    expect(mentionsAttachment('PFA the file')).toBe(true)
    expect(mentionsAttachment("<p>I've included the drawing</p>")).toBe(true)
    expect(mentionsAttachment('Thanks for the update')).toBe(false)
    // Similar words must not trigger (word boundaries).
    expect(mentionsAttachment('The attack surface is small')).toBe(false)
    expect(mentionsAttachment('Our attaché will call')).toBe(false)
  })

  it('mentionsAttachment ignores quoted reply text — only my words count', () => {
    const quotedOnly = '<p>Thanks!</p><blockquote><p>Please see the attached invoice</p></blockquote>'
    expect(mentionsAttachment(quotedOnly)).toBe(false)
    const nested = '<p>Sure</p><blockquote><p>fine</p><blockquote><p>attached here</p></blockquote></blockquote>'
    expect(mentionsAttachment(nested)).toBe(false)
    const mine = '<p>Now attached properly.</p><blockquote><p>you forgot the file</p></blockquote>'
    expect(mentionsAttachment(mine)).toBe(true)
  })
})
