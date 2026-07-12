import type { ComposePayload, MessageDetail } from '@shared/db'

// Build a fresh, fully editable draft from an existing message ("Edit as new" /
// resend). Copies recipients, subject and body verbatim — nothing is stripped —
// so the user can tweak and send it themselves. Pure (no DB/DOM): it only makes
// the payload; it never sends. inReplyToMessageId is deliberately left unset so
// this reads as a new message, not a reply in the original thread.
export function buildEditAsNewDraft(m: MessageDetail): Omit<ComposePayload, 'draftId'> {
  return {
    accountId: m.accountId,
    to: m.to,
    cc: m.cc,
    bcc: [],
    subject: m.subject ?? '',
    bodyHtml: m.bodyHtml ?? (m.bodyText ? `<pre>${m.bodyText.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))}</pre>` : '')
  }
}
