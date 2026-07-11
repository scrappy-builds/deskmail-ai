import { describe, expect, it } from 'vitest'
import { senderSignals, withinOneEdit, type SenderSignalInput } from '../../src/renderer/mail/senderSignals'

const BASE: SenderSignalInput = {
  fromName: 'Maya Chen',
  fromEmail: 'maya@northwind.studio',
  replyTo: null,
  priorMessagesFromSender: 4,
  myDomains: ['example.com'],
  frequentDomains: ['northwind.studio', 'ebay.co.uk']
}

const ids = (input: SenderSignalInput): string[] => senderSignals(input).map((s) => s.id)

describe('withinOneEdit (Damerau-Levenshtein distance 1)', () => {
  it('substitution, insertion, deletion, transposition', () => {
    expect(withinOneEdit('exampledomain', 'examp1edomain')).toBe(true) // substitution
    expect(withinOneEdit('ebay', 'ebbay')).toBe(true) // insertion
    expect(withinOneEdit('paypal', 'papal')).toBe(true) // deletion
    expect(withinOneEdit('paypal', 'payapl')).toBe(true) // transposition
  })
  it('equal or further apart are not lookalikes', () => {
    expect(withinOneEdit('same.com', 'same.com')).toBe(false)
    expect(withinOneEdit('short.com', 'entirely-different.org')).toBe(false)
    expect(withinOneEdit('ab', 'ba' + 'x')).toBe(false)
  })
})

describe('sender signals', () => {
  it('a known clean sender raises nothing', () => {
    expect(ids(BASE)).toEqual([])
  })

  it('first contact is informational', () => {
    const s = senderSignals({ ...BASE, priorMessagesFromSender: 0 })
    expect(s.map((x) => x.id)).toEqual(['first-contact'])
    expect(s[0].severity).toBe('info')
  })

  it('display name impersonating a different address warns', () => {
    const s = senderSignals({ ...BASE, fromName: 'support@paypal.com', fromEmail: 'grab@evil.example' })
    expect(s.map((x) => x.id)).toContain('name-impersonation')
  })

  it('display name matching the real domain is fine', () => {
    expect(ids({ ...BASE, fromName: 'maya@northwind.studio' })).toEqual([])
  })

  it('lookalike domain warns (one letter off my own domain)', () => {
    // "examp1e.com" — the l swapped for a 1, one edit off my own domain.
    const s = senderSignals({ ...BASE, fromEmail: 'orders@examp1e.com' })
    expect(s.map((x) => x.id)).toContain('lookalike-domain')
  })

  it('legit subdomains are not lookalikes', () => {
    expect(ids({ ...BASE, fromEmail: 'no-reply@mail.northwind.studio' })).not.toContain('lookalike-domain')
  })

  it('reply-to pointing at a different domain warns', () => {
    const s = senderSignals({ ...BASE, replyTo: 'collect@elsewhere.example' })
    expect(s.map((x) => x.id)).toContain('replyto-mismatch')
  })

  it('reply-to on the same domain is fine', () => {
    expect(ids({ ...BASE, replyTo: 'team@northwind.studio' })).toEqual([])
  })
})
