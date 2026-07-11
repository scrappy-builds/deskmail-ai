import type { ComposePayload, MessageDetail } from '@shared/db'

export type ReplyKind = 'reply' | 'replyAll' | 'forward'

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

// Strip any existing Re:/Fwd: prefixes so we don't stack them.
function bareSubject(subject: string | null): string {
  return (subject ?? '').replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, '').trim()
}

function dedupe(emails: string[], exclude: string[]): string[] {
  const seen = new Set(exclude.map((e) => e.toLowerCase()))
  const out: string[] = []
  for (const e of emails) {
    const key = e.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(e.trim())
  }
  return out
}

// The original message rendered as a quoted block (HTML if we have it, else the
// escaped plain text). Used for both reply and forward bodies.
function quotedOriginal(m: MessageDetail): string {
  const inner = m.bodyHtml ?? (m.bodyText ? `<p>${escapeHtml(m.bodyText).replace(/\n/g, '<br>')}</p>` : '')
  return `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #c8ccd4;padding-left:1ex;color:#5b6472">${inner}</blockquote>`
}

// Build a compose draft payload prefilled from a message for reply / reply-all /
// forward. Pure (no DB/DOM), so it's unit-tested directly. selfEmail is the
// account's own address, excluded from reply-all recipients.
export function buildReplyDraft(m: MessageDetail, kind: ReplyKind, selfEmail?: string): Omit<ComposePayload, 'draftId'> {
  const from = m.fromEmail ? [m.fromEmail] : []
  const self = selfEmail ? [selfEmail] : []
  const bare = bareSubject(m.subject)

  if (kind === 'forward') {
    const header =
      `<p>---------- Forwarded message ----------<br>` +
      `From: ${escapeHtml(m.fromName || m.fromEmail || '')}<br>` +
      `Subject: ${escapeHtml(m.subject ?? '')}<br>` +
      `To: ${escapeHtml(m.to.join(', '))}</p>`
    return {
      accountId: m.accountId,
      to: [],
      cc: [],
      bcc: [],
      subject: `Fwd: ${bare}`,
      bodyHtml: `<p></p>${header}${quotedOriginal(m)}`,
      inReplyToMessageId: m.id
    }
  }

  // reply / reply-all
  const cc = kind === 'replyAll' ? dedupe([...m.to, ...m.cc], [...from, ...self]) : []
  return {
    accountId: m.accountId,
    to: from,
    cc,
    bcc: [],
    subject: `Re: ${bare}`,
    bodyHtml: `<p></p>${quotedOriginal(m)}`,
    inReplyToMessageId: m.id
  }
}
