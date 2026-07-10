import { describe, expect, it } from 'vitest'
import { parseMailto } from '../../src/shared/mailto'

describe('parseMailto', () => {
  it('parses a plain address', () => {
    expect(parseMailto('mailto:a@b.com')).toEqual({ to: ['a@b.com'], cc: [], bcc: [], subject: '', body: '' })
  })

  it('parses multiple recipients in the path', () => {
    expect(parseMailto('mailto:a@b.com,c@d.com').to).toEqual(['a@b.com', 'c@d.com'])
  })

  it('parses subject, cc, bcc and body with %20 / %0A encoding', () => {
    const r = parseMailto('mailto:a@b.com?subject=Hi%20there&cc=c@d.com&bcc=e@f.com&body=Line1%0ALine2')
    expect(r).toEqual({
      to: ['a@b.com'],
      cc: ['c@d.com'],
      bcc: ['e@f.com'],
      subject: 'Hi there',
      body: 'Line1\nLine2'
    })
  })

  it("decodes '+' to a space in subject/body", () => {
    expect(parseMailto('mailto:?subject=a+b&body=x+y').subject).toBe('a b')
    expect(parseMailto('mailto:?body=x+y').body).toBe('x y')
  })

  it("keeps '+' literal in an address local-part", () => {
    expect(parseMailto('mailto:jamie+news@x.com').to).toEqual(['jamie+news@x.com'])
  })

  it('honours an extra ?to= param alongside path recipients', () => {
    expect(parseMailto('mailto:a@b.com?to=c@d.com').to).toEqual(['a@b.com', 'c@d.com'])
  })

  // Trust boundary: anything that isn't a real mailto: yields empty fields.
  it('returns empty fields for junk / non-mailto input', () => {
    for (const bad of ['', '   ', 'notmailto', 'http://example.com', 'mailto:', 'javascript:alert(1)']) {
      expect(parseMailto(bad)).toEqual({ to: [], cc: [], bcc: [], subject: '', body: '' })
    }
  })

  it('does not throw on malformed percent-encoding', () => {
    expect(() => parseMailto('mailto:a@b.com?subject=%E0%A4%A')).not.toThrow()
  })
})
