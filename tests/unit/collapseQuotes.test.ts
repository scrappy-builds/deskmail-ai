// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collapseQuotes } from '../../src/renderer/mail/collapseQuotes'
import { sanitiseEmail } from '../../src/renderer/mail/sanitise'

describe('quoted-text collapsing', () => {
  it('wraps a plain blockquote in a details disclosure', () => {
    const r = collapseQuotes('<p>Thanks!</p><blockquote><p>original</p></blockquote>')
    expect(r.hadQuote).toBe(true)
    expect(r.html).toContain('<details class="dm-quote">')
    expect(r.html).toContain('<summary')
    expect(r.html).toMatch(/<details[^>]*>[\s\S]*original[\s\S]*<\/details>/)
    expect(r.html).toContain('<p>Thanks!</p>')
  })

  it('nested quotes collapse under ONE wrapper (the outermost)', () => {
    const r = collapseQuotes('<p>x</p><blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>')
    expect((r.html.match(/<details/g) ?? []).length).toBe(1)
  })

  it('Gmail-style div.gmail_quote collapses', () => {
    const r = collapseQuotes('<p>reply</p><div class="gmail_quote"><p>On Tue, Maya wrote:</p></div>')
    expect(r.hadQuote).toBe(true)
    expect(r.html).toMatch(/<details[^>]*>[\s\S]*Maya wrote[\s\S]*<\/details>/)
  })

  it('Outlook divRplyFwdMsg header collapses with everything after it', () => {
    const r = collapseQuotes('<p>reply</p><div id="divRplyFwdMsg"><b>From:</b> Maya</div><div><p>the original body</p></div>')
    expect(r.hadQuote).toBe(true)
    expect(r.html).toMatch(/<details[^>]*>[\s\S]*From:[\s\S]*the original body[\s\S]*<\/details>/)
  })

  it('plain-text "Original Message" marker collapses the rest', () => {
    const r = collapseQuotes('<p>cheers</p><p>-----Original Message-----</p><p>quoted stuff</p>')
    expect(r.hadQuote).toBe(true)
    expect(r.html).toMatch(/<details[^>]*>[\s\S]*quoted stuff[\s\S]*<\/details>/)
    expect(r.html.indexOf('cheers')).toBeLessThan(r.html.indexOf('<details'))
  })

  it('no quote → untouched passthrough', () => {
    const html = '<p>just a normal email</p>'
    const r = collapseQuotes(html)
    expect(r.hadQuote).toBe(false)
    expect(r.html).toBe(html)
  })

  it('runs after DOMPurify and only adds whitelisted details/summary', () => {
    const dirty = '<p>hi</p><blockquote><p>old</p><script>alert(1)</script></blockquote>'
    const clean = sanitiseEmail(dirty, false).html
    const r = collapseQuotes(clean)
    expect(r.html).not.toContain('script')
    expect(r.html).toContain('<details class="dm-quote">')
  })
})
