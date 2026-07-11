import { describe, expect, it } from 'vitest'
import { initialAllow } from '../../src/renderer/mail/EmailBody'

describe('EmailBody initialAllow', () => {
  it('auto-loads when allowed by default', () => {
    expect(initialAllow(true, false)).toBe(true)
  })
  it('blocks when not allowed by default and not remembered (Junk, first view)', () => {
    expect(initialAllow(false, false)).toBe(false)
  })
  it('honours a remembered manual load even when blocked by default', () => {
    expect(initialAllow(false, true)).toBe(true)
  })
})
