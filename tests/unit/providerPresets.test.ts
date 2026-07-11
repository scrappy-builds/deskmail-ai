import { describe, expect, it } from 'vitest'
import { domainOf, suggestSettings } from '../../src/shared/providerPresets'

describe('provider presets', () => {
  it('parses the domain from an address', () => {
    expect(domainOf('Alex <alex@Example.CO.UK>'.replace(/.*</, '').replace('>', ''))).toBe('example.co.uk')
    expect(domainOf('a@b.com')).toBe('b.com')
    expect(domainOf('nope')).toBe('')
  })

  it('returns confirmed settings for a known provider', () => {
    const g = suggestSettings('someone@gmail.com')
    expect(g.confirmed).toBe(true)
    expect(g.imapHost).toBe('imap.gmail.com')
    expect(g.smtpPort).toBe(465)
    expect(g.note).toMatch(/app-specific password/i)
  })

  it('maps aliases to the same provider', () => {
    expect(suggestSettings('x@hotmail.co.uk').imapHost).toBe('outlook.office365.com')
    expect(suggestSettings('x@me.com').imapHost).toBe('imap.mail.me.com')
    expect(suggestSettings('x@googlemail.com').imapHost).toBe('imap.gmail.com')
  })

  it('guesses mail.<domain> for an unknown/custom domain and flags it unconfirmed', () => {
    const s = suggestSettings('me@mybusiness.co.uk')
    expect(s.confirmed).toBe(false)
    expect(s.imapHost).toBe('mail.mybusiness.co.uk')
    expect(s.imapPort).toBe(993)
    expect(s.smtpHost).toBe('mail.mybusiness.co.uk')
    expect(s.note).toMatch(/confirm/i)
  })
})
