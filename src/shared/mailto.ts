// Parse a mailto: URL (RFC 6068) into compose fields. This string comes from
// outside the app (any web page, any document), so it's a trust boundary: junk
// in → empty fields out, never a throw. Kept pure so it's unit-tested directly.

export interface ParsedMailto {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
}

const EMPTY: ParsedMailto = { to: [], cc: [], bcc: [], subject: '', body: '' }

function splitAddrs(s: string): string[] {
  return s
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s // malformed %XX — hand back the raw text rather than throwing
  }
}

export function parseMailto(url: string): ParsedMailto {
  if (typeof url !== 'string') return { ...EMPTY }
  const m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(url.trim())
  if (!m) return { ...EMPTY }

  // Primary recipients live in the path. Percent-decode each, but keep '+'
  // literal — it's valid in an email local-part (jamie+news@…).
  const to = splitAddrs(m[1] ?? '').map(decode)

  // Query params. URLSearchParams turns both %20 and '+' into spaces, which is
  // what we want for subject/body; cc/bcc are addresses (rarely contain '+').
  const params = new URLSearchParams(m[2] ?? '')
  const cc = splitAddrs(params.get('cc') ?? '')
  const bcc = splitAddrs(params.get('bcc') ?? '')
  const subject = params.get('subject') ?? ''
  const body = params.get('body') ?? ''
  // Some clients also pass extra recipients via ?to=.
  const extraTo = splitAddrs(params.get('to') ?? '')

  return { to: [...to, ...extraTo], cc, bcc, subject, body }
}
