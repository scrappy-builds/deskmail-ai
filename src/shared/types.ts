// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

import type { LayoutPreferences, Theme } from './layout'
import type { AccountInput, AccountSummary, ConnectionConfig, TestResult } from './db'

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
  // Open a message in its own independent window, loaded by id.
  openMessage(id: number): void
  // Account setup + connection testing (Stage 4).
  listAccounts(): Promise<AccountSummary[]>
  testIncoming(config: ConnectionConfig): Promise<TestResult>
  testOutgoing(config: ConnectionConfig): Promise<TestResult>
  saveAccount(input: AccountInput): Promise<{ id: number }>
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
