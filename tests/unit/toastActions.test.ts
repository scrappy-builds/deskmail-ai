import { describe, expect, it } from 'vitest'
import { buildToastXml, parseActionUrl } from '../../src/main/toastActions'

describe('toast quick actions', () => {
  it('the XML carries all three actions and the open launch', () => {
    const xml = buildToastXml('Maya Chen', 'Bracket order', 42)
    expect(xml).toContain('launch="deskmail://open/42"')
    expect(xml).toContain('arguments="deskmail://action/archive/42"')
    expect(xml).toContain('arguments="deskmail://action/trash/42"')
    expect(xml).toContain('arguments="deskmail://action/read/42"')
  })

  it('sender and subject are XML-escaped', () => {
    const xml = buildToastXml('A & B <script>', 'Deal "50%" off \'now\'', 7)
    expect(xml).toContain('A &amp; B &lt;script&gt;')
    expect(xml).toContain('Deal &quot;50%&quot; off &apos;now&apos;')
    expect(xml).not.toContain('<script>')
  })

  it('parseActionUrl accepts exactly the allowed set', () => {
    expect(parseActionUrl('deskmail://action/archive/42')).toEqual({ op: 'archive', messageId: 42 })
    expect(parseActionUrl('deskmail://action/trash/1')).toEqual({ op: 'trash', messageId: 1 })
    expect(parseActionUrl('deskmail://action/read/9')).toEqual({ op: 'read', messageId: 9 })
    expect(parseActionUrl('deskmail://open/5')).toEqual({ op: 'open', messageId: 5 })
  })

  it('rejects junk and injection attempts — the URL is untrusted input', () => {
    expect(parseActionUrl('deskmail://action/delete-forever/42')).toBeNull() // not in the allowed set
    expect(parseActionUrl('deskmail://action/archive/abc')).toBeNull()
    expect(parseActionUrl('deskmail://action/archive/42;DROP TABLE')).toBeNull()
    expect(parseActionUrl('deskmail://action/archive/-1')).toBeNull()
    expect(parseActionUrl('deskmail://action/archive/0')).toBeNull()
    expect(parseActionUrl('deskmail://action/open/5')).toBeNull() // open only via launch form
    expect(parseActionUrl('https://evil.example/deskmail://action/archive/1')).toBeNull()
    expect(parseActionUrl('deskmail://action/archive/999999999999999999')).toBeNull() // too long
    expect(parseActionUrl('')).toBeNull()
  })
})
