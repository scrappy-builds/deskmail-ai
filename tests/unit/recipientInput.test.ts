import { describe, expect, it } from 'vitest'
import { addRecipients, tokenise } from '../../src/renderer/compose/RecipientInput'

describe('recipient tokenising', () => {
  it('splits pasted lists on commas and semicolons', () => {
    expect(tokenise('a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com'])
    expect(tokenise('a@b.com; c@d.com')).toEqual(['a@b.com', 'c@d.com'])
  })
  it('tolerates trailing separators and stray whitespace', () => {
    expect(tokenise(' a@b.com , ')).toEqual(['a@b.com'])
    expect(tokenise(',,')).toEqual([])
  })
  it('addRecipients dedupes case-insensitively, keeping order', () => {
    expect(addRecipients(['A@b.com'], ['a@B.com', 'c@d.com'])).toEqual(['A@b.com', 'c@d.com'])
    expect(addRecipients([], ['x@y.com', 'X@Y.COM'])).toEqual(['x@y.com'])
  })
})
