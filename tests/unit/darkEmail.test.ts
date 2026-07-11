import { describe, expect, it } from 'vitest'
import { isSimpleEmail } from '../../src/renderer/mail/darkEmail'

describe('isSimpleEmail (dark-transform gate)', () => {
  it('plain text-ish mail is simple', () => {
    expect(isSimpleEmail('<p>Hi Alex,</p><p>The bracket arrived. Thanks!</p>')).toBe(true)
  })
  it('a couple of highlight backgrounds are still fine', () => {
    expect(isSimpleEmail('<p style="background-color:#ff0">note</p><td bgcolor="#eee">x</td>')).toBe(true)
  })
  it('background images are never inverted', () => {
    expect(isSimpleEmail('<div style="background-image:url(https://x/y.png)">hero</div>')).toBe(false)
    expect(isSimpleEmail('<div style="background: url(x.jpg) no-repeat">hero</div>')).toBe(false)
  })
  it('designed newsletters (many explicit backgrounds) stay on the white card', () => {
    const designed = Array(6).fill('<td style="background-color:#123456">block</td>').join('')
    expect(isSimpleEmail(designed)).toBe(false)
  })
})
