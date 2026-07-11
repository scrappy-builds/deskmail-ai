import { describe, expect, it } from 'vitest'
import { parseSearchQuery } from '../../src/db/searchQuery'

describe('search query parser', () => {
  it('quotes bare terms as FTS phrases (AND across all columns)', () => {
    expect(parseSearchQuery('invoice studio').fts).toBe('"invoice" "studio"')
  })

  it('maps from:/subject:/body: to FTS column filters', () => {
    expect(parseSearchQuery('from:maya').fts).toBe('sender:"maya"')
    expect(parseSearchQuery('subject:invoice').fts).toBe('subject:"invoice"')
    expect(parseSearchQuery('body:clause').fts).toBe('body:"clause"')
  })

  it('extracts structured filters and keeps them out of the FTS text', () => {
    const p = parseSearchQuery('rent has:attachment is:unread before:2026-07-01 after:2026-01-01')
    expect(p.fts).toBe('"rent"')
    expect(p.hasAttachment).toBe(true)
    expect(p.unread).toBe(true)
    expect(p.before).toBe('2026-07-01')
    expect(p.after).toBe('2026-01-01')
  })

  it('is:read sets unread=false', () => {
    expect(parseSearchQuery('is:read').unread).toBe(false)
  })

  it('leaves an unknown operator value as a literal term', () => {
    expect(parseSearchQuery('re:hello').fts).toBe('"re:hello"')
  })
})
