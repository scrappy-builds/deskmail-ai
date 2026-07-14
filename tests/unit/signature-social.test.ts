import { describe, expect, it } from 'vitest'
import { buildSocialRow, splitSocial, parseSocialRow, upgradeLegacySocial } from '../../src/shared/socialIcons'
import { inlineDataImages } from '../../src/shared/outboundImages'
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
    expect(social).toContain('src="https://functional3duk.co.uk/email/icons/twitter.png"') // hosted, not embedded
    expect(social).not.toContain('data:image') // never a data-URI or cid attachment

    const parsed = parseSocialRow(social)
    expect(parsed).toEqual(links)
  })

  it('drops platforms with no URL and skips the block entirely when none set', () => {
    expect(buildSocialRow([{ id: 'tiktok', url: '  ' }])).toBe('')
    const { social } = splitSocial('<p>hi</p>')
    expect(social).toBe('')
  })

  it('upgrades a legacy data-URI social block to the hosted block, preserving the links', () => {
    const legacy =
      '<p>Bye</p><!--deskmail-social-start--><div style="margin-top:10px">' +
      '<a data-platform="twitter" href="https://x.com/example" target="_blank" style="x"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="20"></a>' +
      '</div><!--deskmail-social-end-->'
    const upgraded = upgradeLegacySocial(legacy)
    expect(upgraded).not.toContain('data:image') // neither the old SVG nor PNG data-URI survives
    expect(upgraded).toContain('src="https://functional3duk.co.uk/email/icons/twitter.png"')
    expect(parseSocialRow(upgraded)).toEqual([{ id: 'twitter', url: 'https://x.com/example' }])
  })
})

describe('inlineDataImages', () => {
  it('replaces a data-URI image with a cid ref and returns the attachment', () => {
    const { html, attachments } = inlineDataImages('<img src="data:image/png;base64,QUJD" width="20">')
    expect(attachments).toHaveLength(1)
    expect(attachments[0].content).toBe('QUJD')
    expect(attachments[0].contentType).toBe('image/png')
    expect(html).toContain(`src="cid:${attachments[0].cid}"`)
    expect(html).not.toContain('data:image')
  })

  it('leaves ordinary hosted images and text untouched', () => {
    const src = '<p>hi</p><img src="https://example.com/a.png">'
    const { html, attachments } = inlineDataImages(src)
    expect(html).toBe(src)
    expect(attachments).toHaveLength(0)
  })

  it('gives each embedded image its own cid', () => {
    const { attachments } = inlineDataImages(
      '<img src="data:image/png;base64,AA"><img src="data:image/jpeg;base64,BB">'
    )
    expect(attachments).toHaveLength(2)
    expect(new Set(attachments.map((a) => a.cid)).size).toBe(2)
    expect(attachments[1].contentType).toBe('image/jpeg')
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
