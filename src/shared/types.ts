// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

export type Theme = 'light' | 'dark'

/**
 * App settings that exist before SQLite lands (Stage 4). For now this is a small
 * JSON file in userData; the shape here is what the renderer sees.
 * ponytail: JSON-file settings now; migrates into the SQLite app_settings table in Stage 4.
 */
export interface AppSettings {
  theme: Theme
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light'
}

// The typed bridge exposed on window.deskmail via contextBridge.
export interface DeskMailApi {
  getSettings(): Promise<AppSettings>
  setTheme(theme: Theme): Promise<void>
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
