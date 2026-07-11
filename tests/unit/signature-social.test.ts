import { describe, expect, it } from 'vitest'
import { buildSocialRow, splitSocial, parseSocialRow } from '../../src/renderer/settings/socialIcons'
import { isExternalUrl, externalHref } from '../../src/renderer/mail/linkHandling'

describe('signature social block', () => {
  it('round-trips selected platforms through build → split → parse', () => {
    const links = [
      { id: 'twitter', url: 'https://x.com/example' },
      { id: 'website', url: 'https://example.com' }
    ]
    const body = '<p>Thanks,<br>Alex</p>' + buildSocialRow(links)

    const { main, social } = splitSocial(body)
    expect(main).toBe('<p>Thanks,<br>Alex</p>')
    expect(social).toContain('data:image/svg+xml;base64,')

    const parsed = parseSocialRow(social)
    expect(parsed).toEqual(links)
  })

  it('drops platforms with no URL and skips the block entirely when none set', () => {
    expect(buildSocialRow([{ id: 'tiktok', url: '  ' }])).toBe('')
    const { social } = splitSocial('<p>hi</p>')
    expect(social).toBe('')
  })
})

describe('email link handling', () => {
  it('only treats http(s) as external', () => {
    expect(isExternalUrl('https://example.com')).toBe(true)
    expect(isExternalUrl('http://example.com')).toBe(true)
    expect(isExternalUrl('mailto:a@b.com')).toBe(false)
    expect(isExternalUrl('/relative')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('duck-types on .closest so a cross-realm element still resolves (regression)', () => {
    // Simulate an element from the iframe realm: it has .closest but is NOT an
    // instanceof this realm's Element — the bug that made clicks do nothing.
    const anchor = { getAttribute: (n: string) => (n === 'href' ? 'https://linkedin.com/in/x' : null) }
    const clicked = { closest: (sel: string) => (sel === 'a' ? anchor : null) } as unknown as EventTarget
    expect(externalHref(clicked)).toBe('https://linkedin.com/in/x')

    const plainText = {} as EventTarget // no .closest
    expect(externalHref(plainText)).toBeNull()
  })
})
