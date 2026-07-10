import { describe, expect, it } from 'vitest'
import { parseListUnsubscribe } from '../../src/renderer/mail/unsubscribe'

describe('List-Unsubscribe parsing', () => {
  it('mailto only', () => {
    const r = parseListUnsubscribe('<mailto:leave@lists.example.com>')!
    expect(r.mailto).toEqual({ to: 'leave@lists.example.com', subject: null })
    expect(r.url).toBeNull()
  })

  it('mailto with subject', () => {
    const r = parseListUnsubscribe('<mailto:leave@x.com?subject=unsubscribe%20me>')!
    expect(r.mailto).toEqual({ to: 'leave@x.com', subject: 'unsubscribe me' })
  })

  it('url only', () => {
    const r = parseListUnsubscribe('<https://news.example.com/unsub?id=42>')!
    expect(r.mailto).toBeNull()
    expect(r.url).toBe('https://news.example.com/unsub?id=42')
  })

  it('both — mailto and url each captured', () => {
    const r = parseListUnsubscribe('<https://x.com/u>, <mailto:leave@x.com>')!
    expect(r.mailto?.to).toBe('leave@x.com')
    expect(r.url).toBe('https://x.com/u')
  })

  it('malformed input returns null (never throws)', () => {
    expect(parseListUnsubscribe('')).toBeNull()
    expect(parseListUnsubscribe(null)).toBeNull()
    expect(parseListUnsubscribe('junk with no entries')).toBeNull()
    expect(parseListUnsubscribe('<mailto:not-an-address>')).toBeNull()
    expect(parseListUnsubscribe('<ftp://weird>')).toBeNull()
  })
})
