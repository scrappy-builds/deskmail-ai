// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

import type { LayoutPreferences, Theme } from './layout'

export type { LayoutPreferences, Theme }

/**
 * The persisted settings blob. For now this is a small JSON file in userData
 * holding the layout preferences (which includes theme).
 * ponytail: JSON-file settings now; migrates into the SQLite layout_preferences
 * table in Stage 4 — same shape, so callers won't change.
 */
export type AppSettings = LayoutPreferences

// The typed bridge exposed on window.deskmail via contextBridge.
export interface DeskMailApi {
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  // Window controls for the custom (frameless) title bar.
  window: {
    minimise(): void
    toggleMaximise(): void
    close(): void
  }
}

declare global {
  interface Window {
    deskmail: DeskMailApi
  }
}
