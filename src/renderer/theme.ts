import { THEME_TOKEN_KEYS } from '@shared/theme'
import type { LayoutPreferences } from '@shared/layout'

// Paint the resolved theme onto the root element. The built-in light/dark
// variable blocks in styles.css supply every token the active custom theme
// doesn't override; overrides go on as inline vars (inline beats stylesheet).
// The soft tints re-derive automatically via color-mix(var(--accent)…).
export function applyTheme(
  prefs: Pick<LayoutPreferences, 'theme' | 'customThemes' | 'activeThemeId'>
): void {
  const root = document.documentElement
  const active = prefs.customThemes.find((t) => t.id === prefs.activeThemeId) ?? null
  root.setAttribute('data-theme', active ? active.base : prefs.theme)
  for (const key of THEME_TOKEN_KEYS) {
    const value = active?.tokens[key]
    if (value) root.style.setProperty(`--${key}`, value)
    else root.style.removeProperty(`--${key}`)
  }
}
