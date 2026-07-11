import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TOKENS,
  THEME_TOKEN_KEYS,
  contrastRatio,
  isValidColour,
  resolveTokens,
  validateImportedTheme
} from '../../src/shared/theme'

describe('resolveTokens', () => {
  it('fills untouched tokens from the base palette', () => {
    const t = resolveTokens({ base: 'dark', tokens: { accent: '#ff00ff' } })
    expect(t.accent).toBe('#ff00ff')
    expect(t.bg).toBe(BUILTIN_TOKENS.dark.bg)
    expect(Object.keys(t).sort()).toEqual([...THEME_TOKEN_KEYS].sort())
  })
})

describe('colour validation (trust boundary)', () => {
  it('accepts plain colours', () => {
    for (const v of ['#fff', '#1e7a38', '#11223344', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)', 'hsl(120 50% 50%)']) {
      expect(isValidColour(v)).toBe(true)
    }
  })
  it('rejects CSS injection attempts and junk', () => {
    for (const v of ['red; background: url(x)', 'var(--text)', 'url(http://evil)', '#zzz', '', 42, null, 'expression(alert(1))']) {
      expect(isValidColour(v)).toBe(false)
    }
  })
})

describe('validateImportedTheme', () => {
  const good = { version: 1, id: 'abc', name: '  Warm Evening  ', base: 'dark', tokens: { accent: '#ff8800', bogus: '#fff', bg: 'var(--evil)' } }

  it('accepts a valid file, trims the name, regenerates the id', () => {
    const t = validateImportedTheme(good)!
    expect(t.name).toBe('Warm Evening')
    expect(t.base).toBe('dark')
    expect(t.id).not.toBe('abc')
    expect(t.tokens.accent).toBe('#ff8800')
  })

  it('drops unknown token keys and invalid values', () => {
    const t = validateImportedTheme(good)!
    expect('bogus' in t.tokens).toBe(false)
    expect('bg' in t.tokens).toBe(false)
  })

  it('rejects non-themes', () => {
    expect(validateImportedTheme(null)).toBeNull()
    expect(validateImportedTheme('nope')).toBeNull()
    expect(validateImportedTheme({ name: 'x', base: 'purple', tokens: {} })).toBeNull()
    expect(validateImportedTheme({ name: '', base: 'dark', tokens: {} })).toBeNull()
    expect(validateImportedTheme({ name: 'x', base: 'dark' })).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('black on white is 21:1, same colour is 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5)
  })
  it('expands 3-digit hex and returns null for non-hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0)
    expect(contrastRatio('rgb(0,0,0)', '#fff')).toBeNull()
  })
  it('flags the sort of pair the editor warns about', () => {
    // Light grey text on white — clearly under the 4.5:1 guideline.
    expect(contrastRatio('#cccccc', '#ffffff')!).toBeLessThan(4.5)
    // The built-in dark theme's primary text passes.
    expect(contrastRatio(BUILTIN_TOKENS.dark.text, BUILTIN_TOKENS.dark.bg)!).toBeGreaterThan(4.5)
  })
})
