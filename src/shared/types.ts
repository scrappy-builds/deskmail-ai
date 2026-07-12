// Shared types across main / preload / renderer. Keep this the single source of
// truth for IPC payloads so the bridge stays strongly typed on both sides.

import type { LayoutPreferences, Theme } from './layout'
import type { CustomTheme } from './theme'
import type { Keymap } from './shortcuts'
import type {
  AccountInput,
  AccountSummary,
  AttachmentBrowserItem,
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
  SenderContext,
  SendResult,
  SignatureData,
  SignatureItem,
  SnoozeOption,
  TaskItem,
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
  // Subscribe to "the MCP connector staged an account" — open the Add-account
  // form pre-filled (password blank). Returns an unsubscribe fn.
  onOpenAccountSetup(cb: (input: AccountInput) => void): () => void
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
    // Full sync back-fill: is there older mail left in this folder, and pull one
    // more page of it (the "Load older" button).
    canBackfill(folderId: number): Promise<boolean>
    backfill(folderId: number): Promise<{ added: number }>
    // History depth in days the back-fill fetches (0 = everything).
    syncDepthGet(): Promise<number>
    syncDepthSet(days: number): Promise<void>
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
    // Save a whole conversation (the message's thread) as one PDF/HTML file.
    exportThreadPdf(id: number): Promise<{ path: string | null }>
    exportThreadHtml(id: number): Promise<{ path: string | null }>
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
    // Dismiss a "waiting on a reply" nudge for good.
    dismissNudge(messageId: number): Promise<void>
    // Tune what counts as "needs attention" (unread and/or starred).
    todayConfigGet(): Promise<{ unread: boolean; starred: boolean }>
    todayConfigSet(patch: { unread?: boolean; starred?: boolean }): Promise<void>
    // Auto junk filter on/off.
    junkEnabled(): Promise<boolean>
    setJunkEnabled(on: boolean): Promise<void>
    // Instant new mail via IMAP IDLE (push) on/off.
    idleEnabled(): Promise<boolean>
    setIdleEnabled(on: boolean): Promise<void>
    // Focused inbox (Focused/Other tabs) — off by default until trained.
    focusedEnabled(): Promise<boolean>
    setFocusedEnabled(on: boolean): Promise<void>
    // Move a message between Focused and Other (also trains the classifier).
    setFocused(messageId: number, focused: boolean): Promise<void>
    // Context for the sender-signal banners (first contact / lookalike / reply-to).
    senderContext(id: number): Promise<SenderContext>
    // Every domain mail history has corresponded with (compose first-contact check).
    knownDomains(): Promise<string[]>
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
    // id is null when the undo window is set to 0 (sent immediately).
    sendWithUndo(payload: ComposePayload): Promise<{ id: number | null; seconds: number; ok: boolean; error?: string }>
    // The configurable undo-send window (seconds, 0–120; 0 = off).
    undoSeconds(): Promise<number>
    setUndoSeconds(n: number): Promise<void>
    listScheduled(): Promise<ScheduledSend[]>
    // Put a failed send back in the queue with fresh retries.
    retryScheduled(id: number): Promise<void>
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
    // Apply an existing rule to mail already in a folder; returns how many were actioned.
    run(ruleId: number, folderId: number): Promise<{ count: number }>
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
  // Lightweight tasks (title + due date + done), surfaced in Today.
  tasks: {
    list(): Promise<TaskItem[]>
    create(title: string, dueAt?: string | null, messageId?: number | null): Promise<{ id: number }>
    setDone(id: number, done: boolean): Promise<void>
    remove(id: number): Promise<void>
  }
  // Claude connector (local MCP server) info for the Settings pane (Stage 9).
  mcp: {
    info(): Promise<{ configJson: string; tools: string[]; dbPath: string }>
  }
  // Keyboard shortcuts: master on/off flag + the remappable key→action map.
  shortcuts: {
    get(): Promise<{ enabled: boolean; map: Keymap }>
    setEnabled(on: boolean): Promise<void>
    setMap(map: Keymap): Promise<void>
  }
  // Default mail app (mailto:). setEnabled(true) registers DeskMail as an
  // available handler and opens Windows' Default-apps page for confirmation.
  mailto: {
    enabled(): Promise<boolean>
    setEnabled(on: boolean): Promise<void>
  }
  // Senders whose remote images always load ("always for this sender").
  trust: {
    is(email: string): Promise<boolean>
    add(email: string): Promise<void>
    remove(email: string): Promise<void>
    list(): Promise<{ email: string; addedAt: string }[]>
  }
  // Attachments + NotebookLM export.
  attachments: {
    // Searchable list of every attachment across the mailbox (paged, 100/page).
    browse(query?: string, offset?: number): Promise<AttachmentBrowserItem[]>
    // Download (if needed) and open an attachment with the OS default app.
    open(messageId: number, attachmentId: number): Promise<{ ok: boolean; error?: string }>
    // Download (if needed) then save one attachment to a user-picked location.
    save(messageId: number, attachmentId: number): Promise<{ ok: boolean; path?: string; error?: string }>
    // Download all, then copy every attachment into a user-picked folder.
    saveAll(messageId: number): Promise<{ ok: boolean; count: number; dir?: string; error?: string }>
    // Download (if needed) and return an inline base64 data: URL, or { ok:false }
    // if the file is missing or exceeds the inline cap (kept for images only).
    dataUrl(messageId: number, attachmentId: number): Promise<{ ok: boolean; dataUrl?: string }>
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
    // One-off duplicate-message cleanup (exact Message-ID matches only).
    dedupeCount(): Promise<number>
    dedupe(): Promise<{ removed: number }>
    // Downloaded-attachment cache cap in MB (0 = unlimited) + current usage.
    attachmentCacheGet(): Promise<{ mb: number; bytesUsed: number }>
    attachmentCacheSet(mb: number): Promise<{ evicted: number; bytesUsed: number }>
  }
  // Custom colour themes: export one to / import one from a .deskmailtheme file.
  theme: {
    export(theme: CustomTheme): Promise<{ path: string | null }>
    import(): Promise<{ theme: CustomTheme | null; error?: string }>
  }
  // Set the UI text-size zoom factor across every window (accessibility).
  setZoom(factor: number): void
  // Set (null clears) the Windows taskbar unread overlay badge — a PNG data URL.
  setBadge(dataUrl: string | null): void
  // Open an http(s) URL in the user's default browser (links inside email bodies).
  openExternal(url: string): void
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
    // Email a real ICS invite (METHOD:REQUEST) to the event's guests.
    sendInvite(eventId: number): Promise<SendResult>
    // Email an iTIP REPLY (Accepted/Tentative/Declined) to the invite's organiser.
    respondInvite(messageId: number, response: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'): Promise<SendResult>
    // Full details for a single event (the reminder popup displays these).
    getEvent(id: number): Promise<EventSummary | null>
  }
  // Fired-reminder popup controls.
  reminders: {
    // Re-arm the reminder for `minutes` from now (and close the popup).
    snooze(eventId: number, minutes: number): Promise<void>
    // Stop the reminder (and close the popup).
    dismiss(eventId: number): Promise<void>
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
