import { create } from 'zustand'
import {
  DEFAULT_LAYOUT,
  applyPreset,
  setPref as applyPref,
  type LayoutPreferences,
  type LayoutPreset,
  type Theme
} from '@shared/layout'
import { applyTheme } from '../theme'

// Layout / UI state — kept deliberately separate from mail data state (mailStore).
// Every change persists to settings.json via the IPC bridge so it restores on launch.

interface LayoutState {
  prefs: LayoutPreferences
  hydrated: boolean

  hydrate: () => Promise<void>
  usePreset: (preset: Exclude<LayoutPreset, 'custom'>) => void
  setPref: <K extends keyof LayoutPreferences>(key: K, value: LayoutPreferences[K]) => void
  toggleTheme: () => void
}

function persist(prefs: LayoutPreferences): void {
  // Fire-and-forget; the store is the source of truth for the live UI.
  void window.deskmail.saveSettings(prefs)
}

export const useLayout = create<LayoutState>((set, get) => ({
  prefs: DEFAULT_LAYOUT,
  hydrated: false,

  hydrate: async () => {
    const prefs = await window.deskmail.getSettings()
    applyTheme(prefs)
    window.deskmail.setZoom(prefs.fontScale)
    set({ prefs, hydrated: true })
  },

  usePreset: (preset) => {
    const prefs = applyPreset(get().prefs, preset)
    persist(prefs)
    set({ prefs })
  },

  setPref: (key, value) => {
    const prefs = applyPref(get().prefs, key, value)
    if (key === 'theme' || key === 'customThemes' || key === 'activeThemeId') applyTheme(prefs)
    if (key === 'fontScale') window.deskmail.setZoom(prefs.fontScale)
    persist(prefs)
    set({ prefs })
  },

  // Flips light/dark and drops back to the built-in theme if a custom one is on.
  toggleTheme: () => {
    const p = get().prefs
    const theme: Theme = p.theme === 'dark' ? 'light' : 'dark'
    const prefs = { ...p, theme, activeThemeId: null }
    applyTheme(prefs)
    persist(prefs)
    set({ prefs })
  }
}))
