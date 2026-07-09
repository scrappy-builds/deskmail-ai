// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

import type { LayoutPreferences, Theme } from './layout'
import type {
  AccountInput,
  AccountSummary,
  ComposeAttachment,
  ComposePayload,
  ConnectionConfig,
  Contact,
  DraftSummary,
  MailOp,
  EventInput,
  EventSummary,
  FolderSummary,
  MessageDetail,
  MessageListItem,
  ScheduledSend,
  SendResult,
  SignatureData,
  SnoozeOption,
  Template,
  TestResult,
  TodayAgenda
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
    // Move/flag/read/trash/junk/archive — applied locally + pushed to IMAP.
    action(messageId: number, op: MailOp, targetFolderId?: number): Promise<void>
    sync(accountId?: number): Promise<void>
    // Subscribe to "mail changed" (after a sync/seed). Returns an unsubscribe fn.
    onChanged(cb: () => void): () => void
    // Snooze a message until a quick option's time, or a specific time; or clear it.
    snooze(messageId: number, option: SnoozeOption): Promise<void>
    snoozeUntil(messageId: number, iso: string): Promise<void>
    unsnooze(messageId: number): Promise<void>
    // Unified Today agenda: today's events + unread mail.
    today(): Promise<TodayAgenda>
    // Auto junk filter on/off.
    junkEnabled(): Promise<boolean>
    setJunkEnabled(on: boolean): Promise<void>
  }
  // Compose: drafts, signatures, attachments and manual send (Stage 6/8).
  compose: {
    getSignature(accountId: number): Promise<SignatureData | null>
    updateSignature(accountId: number, body: string, appendToNew: boolean): Promise<void>
    saveDraft(payload: ComposePayload): Promise<{ id: number }>
    listDrafts(): Promise<DraftSummary[]>
    getDraft(id: number): Promise<DraftSummary | null>
    deleteDraft(id: number): Promise<void>
    pickAttachments(): Promise<ComposeAttachment[]>
    // Send is a manual action only — this is the sole path that sends mail.
    send(payload: ComposePayload): Promise<SendResult>
    // Send-later & undo-send (both go through scheduled_sends).
    scheduleSend(payload: ComposePayload, sendAtIso: string): Promise<{ id: number }>
    sendWithUndo(payload: ComposePayload): Promise<{ id: number }>
    listScheduled(): Promise<ScheduledSend[]>
    cancelScheduled(id: number): Promise<void>
  }
  // Canned reply templates (Stage 8).
  templates: {
    list(): Promise<Template[]>
    create(name: string, subject: string, body: string): Promise<{ id: number }>
    update(id: number, name: string, subject: string, body: string): Promise<void>
    remove(id: number): Promise<void>
  }
  // Contacts / address book (Stage 8).
  contacts: {
    list(): Promise<Contact[]>
    search(query: string): Promise<Contact[]>
  }
  // Claude connector (local MCP server) info for the Settings pane (Stage 9).
  mcp: {
    info(): Promise<{ configJson: string; tools: string[]; dbPath: string }>
  }
  // Attachments + NotebookLM export.
  attachments: {
    // Download (if needed) and open an attachment with the OS default app.
    open(messageId: number, attachmentId: number): Promise<{ ok: boolean; error?: string }>
  }
  notebooklm: {
    // Export an email (+ attachments) to a folder for the notebooklm skill to add.
    export(messageId: number, includeAttachments: boolean): Promise<{ folder: string; files: { name: string; path: string }[]; note?: string }>
  }
  // Local storage: backup / restore / portability (Stage 10).
  storage: {
    info(): Promise<{ dataDir: string; portable: boolean }>
    backup(destDir?: string): Promise<{ path: string | null }>
    restore(backupDir?: string): Promise<{ ok: boolean }>
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
