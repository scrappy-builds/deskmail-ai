import { create } from 'zustand'
import {
  DEFAULT_LAYOUT,
  applyPreset,
  setPref as applyPref,
  type LayoutPreferences,
  type LayoutPreset,
  type Theme
} from '@shared/layout'

// Layout / UI state — kept deliberately separate from mail data state (mailStore).
// Every change persists to settings.json via the IPC bridge so it restores on launch.

interface LayoutState {
  prefs: LayoutPreferences
  hydrated: boolean
  // Claude slide-over / float open state is session-only, not persisted.
  claudeOpen: boolean

  hydrate: () => Promise<void>
  usePreset: (preset: Exclude<LayoutPreset, 'custom'>) => void
  setPref: <K extends keyof LayoutPreferences>(key: K, value: LayoutPreferences[K]) => void
  toggleTheme: () => void
  toggleClaude: () => void
}

function persist(prefs: LayoutPreferences): void {
  // Fire-and-forget; the store is the source of truth for the live UI.
  void window.deskmail.saveSettings(prefs)
}

export const useLayout = create<LayoutState>((set, get) => ({
  prefs: DEFAULT_LAYOUT,
  hydrated: false,
  claudeOpen: false,

  hydrate: async () => {
    const prefs = await window.deskmail.getSettings()
    document.documentElement.setAttribute('data-theme', prefs.theme)
    set({ prefs, hydrated: true })
  },

  usePreset: (preset) => {
    const prefs = applyPreset(get().prefs, preset)
    persist(prefs)
    set({ prefs })
  },

  setPref: (key, value) => {
    const prefs = applyPref(get().prefs, key, value)
    if (key === 'theme') document.documentElement.setAttribute('data-theme', prefs.theme)
    persist(prefs)
    set({ prefs })
  },

  toggleTheme: () => {
    const next: Theme = get().prefs.theme === 'dark' ? 'light' : 'dark'
    get().setPref('theme', next)
  },

  // Docked Claude is always visible; otherwise toggle the slide-over/float.
  toggleClaude: () => set((s) => ({ claudeOpen: !s.claudeOpen }))
}))
