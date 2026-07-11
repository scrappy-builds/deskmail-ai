// Parses a search box query into an FTS5 MATCH expression plus structured
// filters. Supports operators: from:/sender:, subject:, body:, has:attachment,
// is:unread / is:read, before:YYYY-MM-DD, after:YYYY-MM-DD. Anything else is a
// free-text term matched across all columns. Pure + unit-tested.

export interface ParsedSearch {
  fts: string // FTS5 MATCH expression ('' when there are no text terms)
  hasAttachment?: boolean
  unread?: boolean
  before?: string // ISO date (exclusive upper bound)
  after?: string // ISO date (inclusive lower bound)
}

// Quote a value as an FTS5 phrase so punctuation/operators can't break the MATCH.
function phrase(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

const OP = /^(from|sender|subject|body|has|is|before|after):(.+)$/i

export function parseSearchQuery(query: string): ParsedSearch {
  const out: ParsedSearch = { fts: '' }
  const ftsParts: string[] = []

  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const m = OP.exec(token)
    if (!m) {
      ftsParts.push(phrase(token))
      continue
    }
    const key = m[1].toLowerCase()
    const val = m[2]
    switch (key) {
      case 'from':
      case 'sender':
        ftsParts.push(`sender:${phrase(val)}`)
        break
      case 'subject':
        ftsParts.push(`subject:${phrase(val)}`)
        break
      case 'body':
        ftsParts.push(`body:${phrase(val)}`)
        break
      case 'has':
        if (/^attachments?$/i.test(val) || /^file$/i.test(val)) out.hasAttachment = true
        else ftsParts.push(phrase(token)) // unknown has: value → treat literally
        break
      case 'is':
        if (/^unread$/i.test(val)) out.unread = true
        else if (/^read$/i.test(val)) out.unread = false
        else ftsParts.push(phrase(token))
        break
      case 'before':
        out.before = val
        break
      case 'after':
        out.after = val
        break
    }
  }

  out.fts = ftsParts.join(' ')
  return out
}
