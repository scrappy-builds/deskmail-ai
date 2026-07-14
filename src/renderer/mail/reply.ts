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

// A solid rule marking the boundary between your new message (above) and the
// quoted/forwarded thread (below). An <hr> is used on purpose: it's a clear solid
// line, it survives the TipTap compose editor (StarterKit keeps HorizontalRule,
// unlike a blockquote's inline styling), and it renders in every mail client. It's
// also the anchor buildMail uses to place the signature just above the quote.
const SEPARATOR = '<hr>'

// "On 7 July 2026, 09:00" — the date/time the message we're quoting was sent.
function whenSent(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Reply attribution line ("On <date>, <Name> wrote:") so it's obvious you're
// replying and to whom — the reply equivalent of the forwarded-message header.
function replyAttribution(m: MessageDetail): string {
  const who = escapeHtml(m.fromName || m.fromEmail || 'the sender')
  const when = whenSent(m.receivedAt)
  return `<p>On ${when ? `${when}, ` : ''}${who} wrote:</p>`
}

// Build a compose draft payload prefilled from a message for reply / reply-all /
// forward. Pure (no DB/DOM), so it's unit-tested directly. selfEmail is the
// account's own address, excluded from reply-all recipients.
export function buildReplyDraft(m: MessageDetail, kind: ReplyKind, selfEmail?: string): Omit<ComposePayload, 'draftId'> {
  const from = m.fromEmail ? [m.fromEmail] : []
  const self = selfEmail ? [selfEmail] : []
  const bare = bareSubject(m.subject)

  if (kind === 'forward') {
    // Forwarded-message header — no dashes; the <hr> above provides the divider.
    const header =
      `<p><strong>Forwarded message</strong><br>` +
      `From: ${escapeHtml(m.fromName || m.fromEmail || '')}<br>` +
      `Date: ${whenSent(m.receivedAt)}<br>` +
      `Subject: ${escapeHtml(m.subject ?? '')}<br>` +
      `To: ${escapeHtml(m.to.join(', '))}</p>`
    return {
      accountId: m.accountId,
      to: [],
      cc: [],
      bcc: [],
      subject: `Fwd: ${bare}`,
      // <p></p> (your text) → solid line → forwarded header → quoted original.
      bodyHtml: `<p></p>${SEPARATOR}${header}${quotedOriginal(m)}`,
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
    // <p></p> (your text) → solid line → "On … wrote:" → quoted original.
    bodyHtml: `<p></p>${SEPARATOR}${replyAttribution(m)}${quotedOriginal(m)}`,
    inReplyToMessageId: m.id
  }
}
