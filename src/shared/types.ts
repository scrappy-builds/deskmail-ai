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
  ContactDetail,
  ContactInput,
  DraftSummary,
  MailOp,
  EventInput,
  EventSummary,
  FolderSummary,
  LabelInfo,
  MessageDetail,
  MessageListItem,
  NotifySettings,
  Rule,
  RuleInput,
  SmartView,
  SmartViewInput,
  ScheduledSend,
  SendResult,
  SignatureData,
  SignatureItem,
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
  // Open the compose window (its own resizable window). Optional draft to edit.
  openCompose(draftId?: number): void
  // Account setup + connection testing (Stage 4).
  listAccounts(): Promise<AccountSummary[]>
  testIncoming(config: ConnectionConfig): Promise<TestResult>
  testOutgoing(config: ConnectionConfig): Promise<TestResult>
  saveAccount(input: AccountInput): Promise<{ id: number }>
  // Full account details for editing (password included, decrypted for prefill).
  getAccount(id: number): Promise<AccountInput | null>
  updateAccount(id: number, input: AccountInput): Promise<{ id: number }>
  // Mail data (DB-backed; reads work offline) + background sync (Stage 5).
  mail: {
    listFolders(accountId?: number): Promise<FolderSummary[]>
    listMessages(folderId: number): Promise<MessageListItem[]>
    listUnified(): Promise<MessageListItem[]> // all accounts' inboxes combined
    search(query: string): Promise<MessageListItem[]>
    getMessage(id: number): Promise<MessageDetail | null>
    markRead(id: number, read: boolean): Promise<void>
    // Move/flag/read/trash/junk/archive/delete-forever — applied locally + pushed to IMAP.
    action(messageId: number, op: MailOp, targetFolderId?: number): Promise<void>
    // Mark every message in a folder read; permanently empty a folder (Trash/Junk).
    markFolderRead(folderId: number): Promise<{ count: number }>
    emptyFolder(folderId: number): Promise<{ count: number }>
    sync(accountId?: number): Promise<void>
    // Folder management: create/rename/delete custom folders (standard roles are protected).
    createFolder(accountId: number, name: string, parentId?: number | null): Promise<{ id: number }>
    renameFolder(id: number, name: string): Promise<void>
    deleteFolder(id: number): Promise<{ moved: number }>
    moveFolder(id: number, parentId: number | null): Promise<void>
    reorderFolders(ids: number[]): Promise<void>
    // Local-only flags (no IMAP equivalent) + print a message to PDF.
    pin(id: number, on: boolean): Promise<void>
    mute(id: number, on: boolean): Promise<void>
    printPdf(id: number): Promise<{ path: string | null }>
    // Pop-out helpers: raw source (reconstructed .eml), prev/next in folder, save to disk.
    messageSource(id: number): Promise<string | null>
    messageNeighbours(id: number): Promise<{ prevId: number | null; nextId: number | null }>
    saveMessage(id: number, format: 'eml' | 'html'): Promise<{ path: string | null }>
    // Import an .mbox/.eml into a folder; export a folder to .mbox.
    importMail(folderId: number): Promise<{ count: number }>
    exportMbox(folderId: number): Promise<{ count: number; path: string | null }>
    listByLabel(labelId: number): Promise<MessageListItem[]>
    // Subscribe to "mail changed" (after a sync/seed). Returns an unsubscribe fn.
    onChanged(cb: () => void): () => void
    // Snooze a message until a quick option's time, or a specific time; or clear it.
    snooze(messageId: number, option: SnoozeOption): Promise<void>
    // Follow-up flag: set a "follow up by" date (quick option) or clear it.
    setFollowup(messageId: number, option: SnoozeOption | 'clear'): Promise<void>
    snoozeUntil(messageId: number, iso: string): Promise<void>
    unsnooze(messageId: number): Promise<void>
    // Unified Today agenda: today's events + mail that needs attention.
    today(): Promise<TodayAgenda>
    // Tune what counts as "needs attention" (unread and/or starred).
    todayConfigGet(): Promise<{ unread: boolean; starred: boolean }>
    todayConfigSet(patch: { unread?: boolean; starred?: boolean }): Promise<void>
    // Auto junk filter on/off.
    junkEnabled(): Promise<boolean>
    setJunkEnabled(on: boolean): Promise<void>
  }
  // Compose: drafts, signatures, attachments and manual send (Stage 6/8).
  compose: {
    getSignature(accountId: number): Promise<SignatureData | null>
    updateSignature(accountId: number, body: string, appendToNew: boolean): Promise<void>
    // Multiple signatures per account (rich HTML), selectable at compose time.
    listSignatures(accountId: number): Promise<SignatureItem[]>
    createSignature(accountId: number, name: string, body: string): Promise<{ id: number }>
    updateSignatureById(id: number, name: string, body: string): Promise<void>
    deleteSignature(id: number): Promise<void>
    setDefaultSignature(accountId: number, id: number): Promise<void>
    setSignatureAppend(accountId: number, on: boolean): Promise<void>
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
  // Contacts / address book (Stage 8 + manual add/edit + groups).
  contacts: {
    list(): Promise<Contact[]>
    search(query: string): Promise<Contact[]>
    listDetail(): Promise<ContactDetail[]>
    groups(): Promise<string[]>
    create(input: ContactInput): Promise<{ id: number }>
    update(id: number, input: ContactInput): Promise<void>
    remove(id: number): Promise<void>
    importVcf(): Promise<{ count: number }>
    exportVcf(): Promise<{ path: string | null }>
  }
  // Saved smart views: match-all/any condition sets over the mailbox.
  smartViews: {
    list(): Promise<SmartView[]>
    create(input: SmartViewInput): Promise<{ id: number }>
    remove(id: number): Promise<void>
    run(id: number): Promise<MessageListItem[]>
  }
  // Local rules / filters run on incoming mail (one condition → one action).
  rules: {
    list(): Promise<Rule[]>
    create(input: RuleInput): Promise<{ id: number }>
    update(id: number, input: RuleInput): Promise<void>
    remove(id: number): Promise<void>
  }
  // Colour labels/tags (a message can carry several; distinct from folders).
  labels: {
    list(): Promise<LabelInfo[]>
    create(name: string, colour?: string): Promise<{ id: number }>
    rename(id: number, name: string, colour?: string): Promise<void>
    remove(id: number): Promise<void>
    forMessage(messageId: number): Promise<LabelInfo[]>
    toggle(messageId: number, labelId: number, on: boolean): Promise<void>
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
    // Scheduled auto-backup: destination folder + interval in days (0 = off).
    autoBackupGet(): Promise<{ dir: string | null; days: number }>
    autoBackupSet(dir: string | null, days: number): Promise<void>
    pickFolder(): Promise<{ path: string | null }>
  }
  // Set the UI text-size zoom factor across every window (accessibility).
  setZoom(factor: number): void
  // Notifications / tray / Focus-DND settings.
  notify: {
    get(): Promise<NotifySettings>
    set(patch: Partial<NotifySettings>): Promise<NotifySettings>
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
