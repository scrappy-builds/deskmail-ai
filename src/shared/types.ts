// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

import type { LayoutPreferences, Theme } from './layout'
import type {
  AccountInput,
  AccountSummary,
  ComposeAttachment,
  ComposePayload,
  ConnectionConfig,
  DraftSummary,
  EventInput,
  EventSummary,
  FolderSummary,
  MessageDetail,
  MessageListItem,
  SendResult,
  TestResult
} from './db'

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
  // Mail data (DB-backed; reads work offline) + background sync (Stage 5).
  mail: {
    listFolders(accountId?: number): Promise<FolderSummary[]>
    listMessages(folderId: number): Promise<MessageListItem[]>
    search(query: string): Promise<MessageListItem[]>
    getMessage(id: number): Promise<MessageDetail | null>
    markRead(id: number, read: boolean): Promise<void>
    sync(accountId?: number): Promise<void>
    // Subscribe to "mail changed" (after a sync/seed). Returns an unsubscribe fn.
    onChanged(cb: () => void): () => void
  }
  // Compose: drafts, signatures, attachments and manual send (Stage 6).
  compose: {
    getSignature(accountId: number): Promise<string | null>
    saveDraft(payload: ComposePayload): Promise<{ id: number }>
    listDrafts(): Promise<DraftSummary[]>
    getDraft(id: number): Promise<DraftSummary | null>
    deleteDraft(id: number): Promise<void>
    pickAttachments(): Promise<ComposeAttachment[]>
    // Send is a manual action only — this is the sole path that sends mail.
    send(payload: ComposePayload): Promise<SendResult>
  }
  // Calendar & meetings (Stage 7).
  calendar: {
    listEvents(from?: string, to?: string): Promise<EventSummary[]>
    createEvent(input: EventInput): Promise<{ id: number }>
    updateEvent(id: number, input: EventInput): Promise<void>
    deleteEvent(id: number): Promise<void>
    join(eventId: number): Promise<void>
    // Accept an email invite → adds it to the calendar, returns the new event id.
    acceptInvite(messageId: number): Promise<{ id: number } | null>
  }
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
