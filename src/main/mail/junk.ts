import { applyAction } from '../../db/mailActions'
import { getMessage } from '../../db/messages'
import { isBayesTrained, scoreSpam } from '../../db/bayes'
import type { DB } from '../../db/database'

export interface JunkVerdict {
  isJunk: boolean
  score: number
  reasons: string[]
}

// Strong spam/phishing phrases (weight 2 each).
const SPAM_PATTERNS: RegExp[] = [
  /\bviagra\b/, /\bcialis\b/, /\blottery\b/, /\byou'?ve? won\b/, /\bprize\b/, /\bwinner\b/,
  /\bfree money\b/, /\bwire transfer\b/, /\bgift ?card\b/, /\binheritance\b/, /\bnigerian? prince\b/,
  /\bclaim your\b/, /\bact now\b/, /\bverify your account\b/, /\baccount (?:has been )?suspended\b/,
  /\bconfirm your (?:password|identity|payment)\b/, /\bunclaimed funds\b/, /\bcrypto(?:currency)?\b/,
  /\bbitcoin\b/, /\bhot singles\b/, /\bwork from home\b/, /\bmiracle\b/, /\brisk[- ]free\b/,
  /\blimited time offer\b/, /\bcongratulations you\b/
]

// Classify an email as junk. Conservative by design (a single false positive is
// worse than a miss) — a match needs a strong keyword plus another signal, or two
// strong keywords. Pure, so it's unit-tested.
export function classifyJunk(subject: string | null, fromEmail: string | null, body: string | null): JunkVerdict {
  const text = `${subject ?? ''} ${body ?? ''}`.toLowerCase()
  let score = 0
  const reasons: string[] = []

  for (const re of SPAM_PATTERNS) {
    if (re.test(text)) {
      score += 2
      reasons.push(`phrase:${re.source}`)
    }
  }
  if (/[A-Z]{6,}/.test(subject ?? '') && /!{2,}/.test(subject ?? '')) {
    score += 1
    reasons.push('shouty-subject')
  }
  const links = (body ?? '').match(/https?:\/\//g)?.length ?? 0
  if (links >= 8) {
    score += 1
    reasons.push('many-links')
  }
  // Sender display domain that doesn't look like a normal address.
  if (fromEmail && /@.*\.(?:xyz|top|click|loan|work|zip|review)$/i.test(fromEmail)) {
    score += 1
    reasons.push('suspicious-tld')
  }

  return { isJunk: score >= 3, score, reasons }
}

// If a stored inbox message looks like junk (and the filter is on), move it to
// Junk (local + queued to IMAP). Returns true if it was moved.
export function applyJunkIfSpam(db: DB, messageId: number, enabled: boolean): boolean {
  if (!enabled) return false
  const m = getMessage(db, messageId)
  if (!m) return false
  const verdict = classifyJunk(m.subject, m.fromEmail, m.bodyText ?? m.bodyHtml)
  // Once trained, a confident Bayesian score also lands mail in Junk.
  const bayesJunk = isBayesTrained(db) && scoreSpam(db, `${m.subject ?? ''} ${m.fromName ?? ''} ${m.bodyText ?? m.bodyHtml ?? ''}`) >= 0.9
  if (!verdict.isJunk && !bayesJunk) return false
  return applyAction(db, messageId, 'junk')
}
