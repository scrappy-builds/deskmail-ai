// Local heuristics for "should I trust this email?" banners. Inform-only in v1
// — no block/allow actions, no network calls, everything computed from data
// already in the local store.

export interface SenderSignal {
  id: 'first-contact' | 'name-impersonation' | 'lookalike-domain' | 'replyto-mismatch'
  severity: 'info' | 'warning'
  text: string
}

export interface SenderSignalInput {
  fromName: string | null
  fromEmail: string | null
  replyTo: string | null
  priorMessagesFromSender: number
  myDomains: string[]
  frequentDomains: string[]
}

const EMAIL_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i

function domainOf(email: string | null): string | null {
  const at = email?.lastIndexOf('@') ?? -1
  return email && at > 0 ? email.slice(at + 1).toLowerCase() : null
}

// True when a and b are one edit apart (substitution, insertion, deletion or
// adjacent transposition) — a hand-rolled Damerau-Levenshtein-distance-1 check,
// which is all lookalike detection needs. Equal strings return false.
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return false
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    const diffs: number[] = []
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) diffs.push(i)
    if (diffs.length === 1) return true // substitution ("functiona1" for "functional")
    return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]] // transposition
  }
  const [short, long] = la < lb ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < short.length) {
    if (short[i] === long[j]) {
      i++
      j++
    } else if (!skipped) {
      skipped = true
      j++ // one insertion/deletion allowed
    } else {
      return false
    }
  }
  return true
}

export function senderSignals(input: SenderSignalInput): SenderSignal[] {
  const signals: SenderSignal[] = []
  const fromDomain = domainOf(input.fromEmail)
  if (!input.fromEmail || !fromDomain) return signals

  // First contact — informational tone, not alarming.
  if (input.priorMessagesFromSender === 0) {
    signals.push({ id: 'first-contact', severity: 'info', text: 'First time this sender has emailed you.' })
  }

  // Display name that IS an email address, but for a different domain — the
  // classic "PayPal <support@evil.example>" trick.
  const nameEmail = input.fromName?.match(EMAIL_RE)?.[1] ?? null
  const nameDomain = domainOf(nameEmail)
  if (nameDomain && nameDomain !== fromDomain) {
    signals.push({
      id: 'name-impersonation',
      severity: 'warning',
      text: `The sender's name looks like "${nameEmail}", but the mail really comes from ${input.fromEmail}.`
    })
  }

  // Lookalike of my own domain or a domain that emails me often.
  const known = [...input.myDomains, ...input.frequentDomains].map((d) => d.toLowerCase())
  const lookalikeOf = known.find((d) => withinOneEdit(fromDomain, d))
  if (lookalikeOf) {
    signals.push({
      id: 'lookalike-domain',
      severity: 'warning',
      text: `${fromDomain} is one letter away from ${lookalikeOf} — check it's really them.`
    })
  }

  // Replies quietly diverted somewhere else.
  const replyDomain = domainOf(input.replyTo)
  if (replyDomain && replyDomain !== fromDomain) {
    signals.push({
      id: 'replyto-mismatch',
      severity: 'warning',
      text: `Replies go to ${input.replyTo} — a different place than the sender.`
    })
  }

  return signals
}
