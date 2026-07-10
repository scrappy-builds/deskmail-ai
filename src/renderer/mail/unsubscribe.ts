// Parse an RFC 2369 List-Unsubscribe header into actionable options.
// The header is comma-separated <…> entries (mailto: and/or https:).
// Prefer mailto (one click to review a compose window, nothing fires silently);
// https is offered as "opens in your browser". RFC 8058 one-click POST is
// deliberately not implemented — no hidden network requests.

export interface UnsubscribeOptions {
  mailto: { to: string; subject: string | null } | null
  url: string | null
}

export function parseListUnsubscribe(header: string | null | undefined): UnsubscribeOptions | null {
  if (!header) return null
  const entries = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim())
  if (entries.length === 0) entries.push(...header.split(',').map((s) => s.trim()))

  let mailto: UnsubscribeOptions['mailto'] = null
  let url: string | null = null
  for (const e of entries) {
    if (!mailto && /^mailto:/i.test(e)) {
      const rest = e.slice('mailto:'.length)
      const q = rest.indexOf('?')
      const addr = decodeURIComponent(q >= 0 ? rest.slice(0, q) : rest).trim()
      let subject: string | null = null
      if (q >= 0) {
        try {
          subject = new URLSearchParams(rest.slice(q + 1)).get('subject')
        } catch {
          subject = null
        }
      }
      if (addr.includes('@')) mailto = { to: addr, subject }
    } else if (!url && /^https?:\/\//i.test(e)) {
      url = e
    }
  }
  return mailto || url ? { mailto, url } : null
}
