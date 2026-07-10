import { resolveShortcut, type Keymap, type ShortcutAction } from '@shared/shortcuts'

// The DOM side of keyboard shortcuts: a single window keydown listener that
// reads the live config each press (so a remap or the master toggle takes effect
// without re-mounting) and dispatches to the supplied action handlers. The
// key→action decision itself is the pure resolveShortcut in @shared/shortcuts.

export interface ShortcutConfig {
  enabled: boolean
  map: Keymap
}

function inTextField(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable
}

// Mount from App via useEffect. getConfig is read fresh on every keypress so the
// caller can gate on the master flag, the current mode, and whether a modal is
// open. Returns an unsubscribe fn for cleanup.
export function installShortcuts(
  getConfig: () => ShortcutConfig,
  actions: Partial<Record<ShortcutAction, () => void>>
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    const cfg = getConfig()
    if (!cfg.enabled) return
    const action = resolveShortcut(
      { key: e.key, inInput: inTextField(e.target), hasModifier: e.ctrlKey || e.altKey || e.metaKey },
      cfg.map
    )
    if (!action) return
    const run = actions[action]
    if (!run) return
    e.preventDefault()
    run()
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
