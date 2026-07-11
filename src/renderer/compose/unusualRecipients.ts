// "First email to <domain>" check: recipient domains that have never appeared
// in mail history. Informational only — never blocks a send.

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : null
}

export function unusualRecipients(recipients: string[], knownDomains: string[]): string[] {
  const known = new Set(knownDomains.map((d) => d.toLowerCase()))
  const out: string[] = []
  for (const r of recipients) {
    const d = domainOf(r)
    if (d && !known.has(d) && !out.includes(d)) out.push(d)
  }
  return out
}
