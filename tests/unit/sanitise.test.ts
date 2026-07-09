// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitiseEmail } from '../../src/renderer/mail/sanitise'

describe('email HTML sanitiser', () => {
  it('strips <script> tags', () => {
    const { html } = sanitiseEmail('<p>hi</p><script>alert(1)</script>')
    expect(html).toContain('<p>hi</p>')
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('strips inline event handlers', () => {
    const { html } = sanitiseEmail('<img src="x" onerror="alert(1)"><a onclick="steal()">x</a>')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
  })

  it('blocks remote images by default and flags it', () => {
    const { html, blockedRemote } = sanitiseEmail('<img src="https://tracker.example/pixel.gif">')
    expect(blockedRemote).toBe(true)
    expect(html).not.toContain('tracker.example')
  })

  it('allows remote images when opted in', () => {
    const { html, blockedRemote } = sanitiseEmail('<img src="https://cdn.example/logo.png">', true)
    expect(blockedRemote).toBe(false)
    expect(html).toContain('cdn.example/logo.png')
  })

  it('keeps embedded data: images (not remote)', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
    const { html, blockedRemote } = sanitiseEmail(`<img src="${src}">`)
    expect(blockedRemote).toBe(false)
    expect(html).toContain('data:image/png')
  })

  it('neutralises remote background images in inline styles', () => {
    const { html, blockedRemote } = sanitiseEmail('<div style="background:url(https://t.example/x.png)">hi</div>')
    expect(blockedRemote).toBe(true)
    expect(html).not.toContain('t.example')
  })
})
