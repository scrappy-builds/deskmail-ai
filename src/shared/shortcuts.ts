// Framework-free keyboard-shortcut model: the action set, the default bindings,
// and the pure key→action dispatch. Shared by the renderer (installs the window
// listener + the remap UI), the main process (merges stored overrides with the
// defaults), and the unit tests. The listed keys are defaults only — the live
// map lives in app_settings, so every binding is user-remappable.

export type ShortcutAction =
  | 'nextMessage'
  | 'prevMessage'
  | 'open'
  | 'archive'
  | 'delete'
  | 'reply'
  | 'compose'
  | 'search'
  | 'toggleUnread'
  | 'help'

export interface ShortcutDef {
  action: ShortcutAction
  label: string
  defaultKey: string
}

// Order here = display order in both the cheat-sheet and the Settings pane.
export const SHORTCUTS: ShortcutDef[] = [
  { action: 'nextMessage', label: 'Next message', defaultKey: 'j' },
  { action: 'prevMessage', label: 'Previous message', defaultKey: 'k' },
  { action: 'open', label: 'Open in its own window', defaultKey: 'Enter' },
  { action: 'archive', label: 'Archive', defaultKey: 'e' },
  { action: 'delete', label: 'Delete (to Bin)', defaultKey: '#' },
  { action: 'reply', label: 'Reply', defaultKey: 'r' },
  { action: 'compose', label: 'Compose', defaultKey: 'c' },
  { action: 'search', label: 'Focus search', defaultKey: '/' },
  { action: 'toggleUnread', label: 'Toggle read / unread', defaultKey: 'u' },
  { action: 'help', label: 'Show this cheat-sheet', defaultKey: '?' }
]

// A binding of '' means the user cleared that action (no key fires it).
export type Keymap = Record<ShortcutAction, string>

export const DEFAULT_KEYMAP: Keymap = SHORTCUTS.reduce((m, s) => {
  m[s.action] = s.defaultKey
  return m
}, {} as Keymap)

// Keys the app needs for its own navigation/focus — refuse to rebind onto these
// (except 'Enter', which is legitimately the default for the 'open' action).
export const RESERVED_KEYS = new Set(['Escape', 'Tab', ' '])

// Normalise a KeyboardEvent.key for comparison: letters are case-insensitive,
// named keys (Enter) fold to lower case too, so the map can store either case.
function normKey(key: string): string {
  return key.toLowerCase()
}

export interface KeyEventLike {
  key: string
  inInput: boolean // focus is in a text field / contenteditable
  hasModifier: boolean // ctrl/alt/meta held (shift alone is fine — '?' needs it)
}

// The whole dispatch, as a pure function: an event-like + the live map → the
// action to run, or null. Guards (input focus, modifiers) live here so they're
// unit-testable without a DOM. First matching binding wins if two collide.
export function resolveShortcut(e: KeyEventLike, map: Keymap): ShortcutAction | null {
  if (e.hasModifier || e.inInput) return null
  const k = normKey(e.key)
  for (const s of SHORTCUTS) {
    const bound = map[s.action]
    if (bound && normKey(bound) === k) return s.action
  }
  return null
}

// Main process: overlay any stored overrides onto the defaults so a partial /
// missing / stale stored map still yields a complete, valid keymap.
export function mergeKeymap(stored: Partial<Keymap> | null | undefined): Keymap {
  return { ...DEFAULT_KEYMAP, ...(stored ?? {}) }
}
