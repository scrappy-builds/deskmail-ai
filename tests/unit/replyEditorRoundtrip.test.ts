// @vitest-environment jsdom
//
// The signature-placement fix hinges on what survives the *compose editor*, not
// just what reply.ts emits. An earlier fix used an HTML-comment marker that the
// TipTap editor silently strips, so it worked in a direct buildMail test but not
// in the real app. This test drives a genuine TipTap StarterKit editor (as
// Compose.tsx does) to prove the real behaviour end-to-end.
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { buildReplyDraft } from '../../src/renderer/mail/reply'
import { buildMail } from '../../src/main/mail/send'
import type { MessageDetail } from '../../src/shared/db'

// What the draft looks like after it has been loaded into and re-serialised by the
// compose editor (content: draft.bodyHtml → getHTML()).
function throughEditor(html: string): string {
  const editor = new Editor({ extensions: [StarterKit], content: html })
  const out = editor.getHTML()
  editor.destroy()
  return out
}

const msg: MessageDetail = {
  id: 7, accountId: 1, folderId: 2, fromName: 'Maya', fromEmail: 'maya@x.com',
  subject: 'Launch plan', snippet: null, receivedAt: '2026-07-07T09:00:00Z',
  isRead: true, isStarred: false, hasAttachments: false, isPinned: false, isMuted: false,
  importance: null, isFocused: false,
  to: ['alex@example.com'], cc: [], bcc: [],
  bodyText: 'the original plan', bodyHtml: '<p>the original plan</p>', attachments: [], invite: null
}

describe('reply/forward signature placement survives the editor round-trip', () => {
  it('the editor strips HTML comments (why a marker cannot be used)', () => {
    expect(throughEditor('<p>hi</p><!--deskmail-quote--><blockquote><p>q</p></blockquote>')).not.toContain('<!--')
  })

  it('the editor keeps the <hr> separator (used as the quote boundary)', () => {
    expect(throughEditor('<p>hi</p><hr><blockquote><p>q</p></blockquote>')).toContain('<hr')
  })

  it('forward: <hr> + forwarded header survive, signature lands above them', () => {
    const draft = buildReplyDraft(msg, 'forward')
    const edited = throughEditor(draft.bodyHtml)
    expect(edited).toContain('<hr')
    expect(edited.indexOf('<hr')).toBeLessThan(edited.indexOf('Forwarded message'))

    const mail = buildMail({ payload: { ...draft, bodyHtml: edited }, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    const out = mail.html as string
    expect(out.indexOf('Thanks,<br>Alex')).toBeLessThan(out.indexOf('<hr'))
    expect(out.indexOf('Thanks,<br>Alex')).toBeLessThan(out.indexOf('Forwarded message'))
  })

  it('reply: <hr> + "wrote:" attribution survive, signature lands above the quote', () => {
    const draft = buildReplyDraft(msg, 'reply', 'alex@example.com')
    const edited = throughEditor(draft.bodyHtml)
    expect(edited).toContain('<hr')
    expect(edited).toContain('wrote:')
    const mail = buildMail({ payload: { ...draft, bodyHtml: edited }, fromName: 'Alex', fromEmail: 'j@x', signature: 'Thanks,\nAlex' })
    const out = mail.html as string
    expect(out.indexOf('Thanks,<br>Alex')).toBeLessThan(out.indexOf('<hr'))
    expect(out.indexOf('Thanks,<br>Alex')).toBeLessThan(out.indexOf('the original plan'))
  })
})
