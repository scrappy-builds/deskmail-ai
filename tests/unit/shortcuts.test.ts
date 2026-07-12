import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, mergeKeymap, resolveShortcut, RESERVED_KEYS, SHORTCUTS, type Keymap } from '../../src/shared/shortcuts'

const ev = (over: Partial<Parameters<typeof resolveShortcut>[0]>): Parameters<typeof resolveShortcut>[0] => ({
  key: 'j',
  inInput: false,
  hasModifier: false,
  ...over
})

describe('resolveShortcut', () => {
  it('maps the default keys to their actions', () => {
    expect(resolveShortcut(ev({ key: 'j' }), DEFAULT_KEYMAP)).toBe('nextMessage')
    expect(resolveShortcut(ev({ key: 'k' }), DEFAULT_KEYMAP)).toBe('prevMessage')
    expect(resolveShortcut(ev({ key: 'Enter' }), DEFAULT_KEYMAP)).toBe('open')
    expect(resolveShortcut(ev({ key: 'e' }), DEFAULT_KEYMAP)).toBe('archive')
    expect(resolveShortcut(ev({ key: '#' }), DEFAULT_KEYMAP)).toBe('delete')
    expect(resolveShortcut(ev({ key: '?' }), DEFAULT_KEYMAP)).toBe('help')
    expect(resolveShortcut(ev({ key: 's' }), DEFAULT_KEYMAP)).toBe('flagToggle')
    expect(resolveShortcut(ev({ key: 'a' }), DEFAULT_KEYMAP)).toBe('replyAll')
    expect(resolveShortcut(ev({ key: 'f' }), DEFAULT_KEYMAP)).toBe('forward')
    expect(resolveShortcut(ev({ key: 'm' }), DEFAULT_KEYMAP)).toBe('markAllRead')
    expect(resolveShortcut(ev({ key: '*' }), DEFAULT_KEYMAP)).toBe('selectAll')
  })

  it('has unique, non-reserved default bindings (no collisions)', () => {
    const keys = SHORTCUTS.map((s) => s.defaultKey).filter((k) => k !== '')
    const lower = keys.map((k) => k.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length) // no two actions share a default
    for (const k of keys) expect(RESERVED_KEYS.has(k)).toBe(false)
  })

  it('is case-insensitive for letters (caps lock / shift)', () => {
    expect(resolveShortcut(ev({ key: 'J' }), DEFAULT_KEYMAP)).toBe('nextMessage')
  })

  it('does nothing while focus is in an input (typing j in search)', () => {
    expect(resolveShortcut(ev({ key: 'j', inInput: true }), DEFAULT_KEYMAP)).toBeNull()
  })

  it('does nothing when a modifier is held', () => {
    expect(resolveShortcut(ev({ key: 'j', hasModifier: true }), DEFAULT_KEYMAP)).toBeNull()
  })

  it('ignores an unbound key', () => {
    expect(resolveShortcut(ev({ key: 'z' }), DEFAULT_KEYMAP)).toBeNull()
  })

  it('honours a remapped binding and ignores the old default', () => {
    const map: Keymap = { ...DEFAULT_KEYMAP, archive: 'a' }
    expect(resolveShortcut(ev({ key: 'a' }), map)).toBe('archive')
    // 'e' is no longer bound to anything now archive moved to 'a'
    expect(resolveShortcut(ev({ key: 'e' }), map)).toBeNull()
  })

  it('treats a cleared ("") binding as unbound', () => {
    const map: Keymap = { ...DEFAULT_KEYMAP, archive: '' }
    expect(resolveShortcut(ev({ key: 'e' }), map)).toBeNull()
  })
})

describe('mergeKeymap', () => {
  it('returns a complete map from a partial override', () => {
    const merged = mergeKeymap({ archive: 'a' })
    expect(merged.archive).toBe('a')
    expect(merged.nextMessage).toBe('j') // untouched defaults preserved
  })
  it('falls back to all defaults for null/undefined', () => {
    expect(mergeKeymap(null)).toEqual(DEFAULT_KEYMAP)
    expect(mergeKeymap(undefined)).toEqual(DEFAULT_KEYMAP)
  })
})
