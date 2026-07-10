import type { DB } from '../../db/database'
import { isBayesTrained, scoreSpam, trainBayes } from '../../db/bayes'

// Focused/Other classification for the inbox, learned locally. A heuristic
// score decides the obvious cases; the Bayes tie-break (its own token table)
// learns from every "Move to Focused/Other" the user makes.

export interface FocusSignals {
  repliedToSender: boolean // I've sent mail to this address before
  senderMessageCount: number // how many messages this sender has in the store
  directToMe: boolean // my address is in To (not just Cc / a list blast)
  hasListHeaders: boolean // List-Unsubscribe present
  noReplySender: boolean // no-reply@ / do-not-reply@ patterns
  bayesScore: number | null // 0..1 "Other-ness"; null while untrained
}

// Pure: true = Focused. ponytail: Precedence:bulk isn't stored at ingest — the
// List-Unsubscribe + no-reply signals cover the same mail in practice; add the
// header capture if real bulk mail slips through.
export function classifyFocus(s: FocusSignals): boolean {
  if (s.repliedToSender) return true // people I write to always reach Focused
  if (s.hasListHeaders || s.noReplySender) return false
  if (s.directToMe || s.senderMessageCount > 2) return true
  if (s.bayesScore != null) return s.bayesScore < 0.5
  return true // benefit of the doubt until the filter has data
}

export function isNoReplySender(email: string | null): boolean {
  return !!email && /^(no[.-]?reply|do[._-]?not[._-]?reply|noreply|notifications?|mailer-daemon)@/i.test(email)
}

// Gather signals for a stored message and stamp is_focused. Called at ingest
// (INBOX mail only) — cheap: three indexed lookups plus token maths.
export function applyFocusClassification(db: DB, messageId: number, myEmails: string[]): boolean {
  const m = db.get('SELECT from_email, to_json, subject, snippet, list_unsubscribe FROM messages WHERE id = ?', [messageId]) as
    | { from_email: string | null; to_json: string | null; subject: string | null; snippet: string | null; list_unsubscribe: string | null }
    | undefined
  if (!m) return true

  const sender = (m.from_email ?? '').toLowerCase()
  const toList = ((): string[] => {
    try {
      const v = JSON.parse(m.to_json ?? '[]')
      return Array.isArray(v) ? v.map((x: string) => x.toLowerCase()) : []
    } catch {
      return []
    }
  })()
  const mine = myEmails.map((e) => e.toLowerCase())

  const repliedToSender =
    sender !== '' &&
    db.get(
      `SELECT 1 x FROM messages s JOIN folders f ON f.id = s.folder_id
        WHERE f.role = 'sent' AND LOWER(s.to_json) LIKE ? LIMIT 1`,
      [`%${sender}%`]
    ) != null
  const senderMessageCount = sender
    ? (db.get('SELECT COUNT(*) c FROM messages WHERE LOWER(from_email) = ? AND id != ?', [sender, messageId]) as { c: number }).c
    : 0
  const text = `${m.subject ?? ''} ${m.from_email ?? ''} ${m.snippet ?? ''}`
  const focused = classifyFocus({
    repliedToSender,
    senderMessageCount,
    directToMe: mine.some((e) => toList.includes(e)),
    hasListHeaders: m.list_unsubscribe != null,
    noReplySender: isNoReplySender(m.from_email),
    bayesScore: isBayesTrained(db, 'focus') ? scoreSpam(db, text, 'focus_tokens', 'focus') : null
  })
  db.run('UPDATE messages SET is_focused = ? WHERE id = ?', [focused ? 1 : 0, messageId])
  return focused
}

// User training: flip the flag and teach the Bayes table both ways
// (Other = spam-side, Focused = ham-side).
export function setMessageFocused(db: DB, messageId: number, focused: boolean): void {
  db.run('UPDATE messages SET is_focused = ? WHERE id = ?', [focused ? 1 : 0, messageId])
  const m = db.get('SELECT subject, from_name, from_email, snippet FROM messages WHERE id = ?', [messageId]) as
    | { subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null }
    | undefined
  if (!m) return
  trainBayes(db, `${m.subject ?? ''} ${m.from_name ?? ''} ${m.from_email ?? ''} ${m.snippet ?? ''}`, !focused, 'focus_tokens', 'focus')
}
