import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app, dialog, session, shell, nativeImage, BrowserWindow, ipcMain, Menu, Notification, Tray } from 'electron'
import { loadSettings } from './settings'
import { resolveDataDir } from './dataDir'
import { backupTo, restoreFrom } from './backup'
import { openDatabase, quarantineIfCorrupt, type DB } from '../db/database'
import { getAppSetting, loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty, setAppSetting } from '../db/settings'
import { getAccount, insertAccount, listAccounts, updateAccount } from '../db/accounts'
import { createFolder, deleteFolder, ensureStandardFolders, getFolder, moveFolder, refreshFolderCounts, renameFolder, reorderFolders } from '../db/folders'
import { imapCreateFolder, imapDeleteFolder, imapRenameFolder } from './mail/folderOps'
import { listFolders } from '../db/folders'
import { allKnownDomains, countDuplicateMessages, countFromSender, dedupeMessages, getMessage, listMessages, listMessagesByLabel, listUnifiedInbox, markFolderRead, markRead, messageNeighbours, searchMessages, setFollowup, setMuted, setPinned, topSenderDomains } from '../db/messages'
import { buildEml, saveMessageFile } from './mail/messageExport'
import { exportMbox, importMailFile } from './mail/mbox'
import { buildVcf, parseVcf } from './contacts/vcard'
import { createLabel, deleteLabel, labelsForMessage, listLabels, renameLabel, setMessageLabel } from '../db/labels'
import { createRule, deleteRule, listRules, updateRule } from '../db/rules'
import { createSmartView, deleteSmartView, listSmartViews, runSmartView } from '../db/smartViews'
import { printMessageToPdf } from './mail/printPdf'
import { checkAutoBackup } from './autoBackup'
import { getNotifySettings, notificationsSuppressed, type NotifySettings } from './notify'
import { applyAction, emptyFolder } from '../db/mailActions'
import { trainBayesFromMessage } from '../db/bayes'
import { drainMailActions } from './mail/drainer'
import { fetchAndSaveAttachments, sweepAttachmentCache } from './mail/attachments'
import { listAllAttachments, listAttachmentRows } from '../db/messages'
import { exportForNotebookLM } from '../mcp/export'
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../db/drafts'
import { createSignature, deleteSignature, ensureDefaultSignature, getSignatureData, listSignatures, setDefaultSignature, setSignatureAppend, updateSignature, updateSignatureById } from '../db/signatures'
import { createEvent, deleteEvent, ensureEventUid, getEvent, listEvents, updateEvent } from '../db/events'
import { buildInviteIcs, type PartStat } from './mail/ics'
import { cancelScheduled, dueScheduled, listScheduled, markError, markSent, recordSendFailure, retryScheduled, scheduleSend } from '../db/scheduledSends'
import { computeSnoozeTime, snoozeMessage, unsnooze } from '../db/snoozes'
import { createTemplate, deleteTemplate, listTemplates, seedTemplatesIfEmpty, updateTemplate } from '../db/templates'
import { createContact, deleteContact, listContacts, listContactGroups, listContactsDetail, searchContacts, updateContact } from '../db/contacts'
import { dismissNudge, getTodayAgenda } from '../db/today'
import { createTask, deleteTask, listTasks, setTaskDone } from '../db/tasks'
import { isTrustedSender, listTrustedSenders, trustSender, untrustSender } from '../db/trustedSenders'
import { buildTools } from '../mcp/tools'
import { getCredential, storeCredential } from './credentials'
import { testIncoming, testOutgoing } from './mail/connectionTest'
import { syncAccount, syncAllAccounts } from './mail/sync'
import { sendMail } from './mail/send'
import { appendToSent } from './mail/appendSent'
import { closePool } from './mail/connectionPool'
import { isIdleHealthy, startIdle, stopAllIdle } from './mail/idle'
import { setMessageFocused } from './mail/focus'
import { buildToastXml, parseActionUrl } from './toastActions'
import { joinMeeting } from './meetings'
import { maybeSeedDemo } from './mail/demoSeed'
import { validateImportedTheme, type CustomTheme } from '@shared/theme'
import type { AppSettings } from '@shared/types'
import type { AccountInput, ComposeAttachment, ComposePayload, ConnectionConfig, ContactInput, EventInput, MailOp, RuleInput, SmartViewInput, SnoozeOption } from '@shared/db'


// Current UI zoom factor (text-size accessibility). Applied to every window on
// load and updated live from the renderer's Text-size control.
let uiZoom = 1

// Decide where data lives (OS app-data, an explicit override, or portable/USB
// mode). Must run before the app is ready so userData points at the right place.
const dataDir = resolveDataDir({
  argv: process.argv,
  env: process.env,
  exeDir: dirname(app.getPath('exe')),
  exists: existsSync
})
if (dataDir.dir) app.setPath('userData', dataDir.dir)

const settingsPath = () => join(app.getPath('userData'), 'settings.json')
// Raw copies of sent mail whose IMAP Sent-folder APPEND failed, awaiting retry.
const spoolDir = () => join(app.getPath('userData'), 'sent-spool')

let db: DB

// Open the SQLite store and, on first run, import the Stage 1–3 settings.json.
// A corrupt store is quarantined first (never written into); the user is told
// once the window is up and pointed at restore-from-backup.
let corruptDbBackupPath: string | null = null
async function initDatabase(): Promise<void> {
  const file = join(app.getPath('userData'), 'deskmail.db')
  corruptDbBackupPath = quarantineIfCorrupt(file)
  db = openDatabase(file)
  const legacy = existsSync(settingsPath()) ? loadSettings(settingsPath()) : null
  seedLayoutIfEmpty(db, legacy)
  seedTemplatesIfEmpty(db) // canned replies exist for real use, not just demo
  await maybeSeedDemo(db)
}

// Background sender: send any scheduled messages whose time has come. Covers both
// "Send later" and undo-send (which schedules a few seconds out). Poll every 5s.
function startScheduledSender(): void {
  const tick = async (): Promise<void> => {
    const due = dueScheduled(db, new Date().toISOString())
    for (const s of due) {
      if (s.draftId == null) {
        markError(db, s.id)
        continue
      }
      const draft = getDraft(db, s.draftId)
      if (!draft || draft.accountId == null) {
        markError(db, s.id)
        continue
      }
      // Attachments are stored as paths, not copies — a file moved since the
      // draft was written must fail the send loudly, never send without it.
      const missing = draft.attachments.filter((a) => !existsSync(a.path))
      if (missing.length > 0) {
        markError(db, s.id, `Attachment no longer at ${missing[0].path}`)
        continue
      }
      const res = await sendMail(db, {
        accountId: draft.accountId,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject ?? '',
        bodyHtml: draft.bodyHtml ?? '',
        attachments: draft.attachments
      })
      if (res.ok) {
        markSent(db, s.id)
        if (res.raw) void appendToSent(db, draft.accountId, res.raw, spoolDir())
      } else {
        // Retry with backoff (1 → 5 → 30 min); the 5th failure is final and loud.
        const { final } = recordSendFailure(db, s.id, res.error)
        if (final && Notification.isSupported()) {
          const n = new Notification({
            title: "I couldn't send your message",
            body: `"${draft.subject || '(no subject)'}" kept failing — it's waiting in your Outbox.`
          })
          n.on('click', showMainWindow)
          n.show()
        }
      }
    }
    if (due.length) broadcastMailChanged()
  }
  setInterval(() => void tick(), 5000)
}

// Tell every open window the local mail cache changed, so it refetches.
function broadcastMailChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('mail:changed')
  updateTrayUnread()
}

// --- System tray + new-mail notifications -----------------------------------
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function trayImage(): Electron.NativeImage {
  const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 })
}

function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    mainWindow = createMainWindow()
  }
}

function unreadInboxCount(): number {
  return (db.get("SELECT COUNT(*) c FROM messages WHERE is_read = 0 AND is_muted = 0 AND folder_id IN (SELECT id FROM folders WHERE role = 'inbox')") as { c: number }).c
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const focusOn = appSetting('focus-now') === 'on'
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open DeskMail', click: showMainWindow },
      { label: 'Sync now', click: () => void syncAndNotify() },
      {
        label: focusOn ? 'Turn off Focus' : 'Focus — mute notifications',
        click: () => {
          setAppSetting(db, 'focus-now', focusOn ? 'off' : 'on')
          rebuildTrayMenu()
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
    ])
  )
}

function updateTrayUnread(): void {
  if (!tray) return
  const c = unreadInboxCount()
  tray.setToolTip(c > 0 ? `DeskMail AI — ${c} unread` : 'DeskMail AI')
}

function createTray(): void {
  if (tray) return
  tray = new Tray(trayImage())
  tray.setToolTip('DeskMail AI')
  tray.on('click', showMainWindow)
  rebuildTrayMenu()
  updateTrayUnread()
}

// Show a desktop notification per new inbox message (unless suppressed by the
// notifications toggle, Focus, or the DND schedule). Capped so a big sync can't
// spray dozens of toasts. On Windows the toast carries Archive / Delete / Mark
// read buttons (protocol activation); elsewhere — and if the toast XML path
// ever misbehaves — it falls back to a plain notification whose click opens
// the message window.
function notifyNewMail(ids: number[]): void {
  if (!Notification.isSupported() || notificationsSuppressed(db)) return
  for (const id of ids.slice(0, 5)) {
    const m = getMessage(db, id)
    if (!m) continue
    const title = m.fromName || m.fromEmail || 'New mail'
    const body = m.subject || '(no subject)'
    try {
      if (process.platform !== 'win32') throw new Error('toastXml is Windows-only')
      new Notification({ toastXml: buildToastXml(title, body, id) }).show()
    } catch {
      const n = new Notification({ title, body })
      n.on('click', () => openMessageWindow(id))
      n.show()
    }
  }
}

// Route a deskmail:// activation (toast button / toast click / command line).
// The URL comes from outside the process — parseActionUrl validates it hard.
function handleProtocolUrl(url: string): boolean {
  const parsed = parseActionUrl(url)
  if (!parsed) return false
  const { op, messageId } = parsed
  if (op === 'open') {
    openMessageWindow(messageId)
    showMainWindow()
  } else if (op === 'read') {
    markRead(db, messageId, true)
    broadcastMailChanged()
  } else {
    applyAction(db, messageId, op) // archive | trash — queued to IMAP as usual
    broadcastMailChanged()
    void drainMailActions(db)
  }
  return true
}

function handleProtocolArgs(argv: string[]): boolean {
  const arg = argv.find((a) => a.startsWith('deskmail://'))
  return arg ? handleProtocolUrl(arg) : false
}

// Fire a one-off reminder for any event starting within ~10 minutes. Keyed per
// occurrence so it only notifies once. Respects the same Focus/DND suppression.
const remindedEvents = new Set<string>()
function checkEventReminders(): void {
  if (notificationsSuppressed(db)) return
  const now = new Date()
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  for (const e of listEvents(db, iso, iso)) {
    if (!e.start) continue
    const [h, m] = e.start.split(':').map(Number)
    const at = new Date(now)
    at.setHours(h, m, 0, 0)
    const mins = (at.getTime() - now.getTime()) / 60000
    const key = `${e.id}-${e.date}-${e.start}`
    if (mins >= 0 && mins <= 10 && !remindedEvents.has(key)) {
      remindedEvents.add(key)
      if (Notification.isSupported()) {
        const n = new Notification({ title: `Soon: ${e.title}`, body: `Starts at ${e.start}` })
        n.on('click', showMainWindow)
        n.show()
      }
    }
  }
}

// Sync, then notify about mail that arrived in the inbox during this pass.
// With an accountId this is a targeted sync (IDLE push); without one it's the
// periodic poll, which skips accounts whose IDLE connection is already healthy.
async function syncAndNotify(accountId?: number): Promise<void> {
  const before = (db.get('SELECT COALESCE(MAX(id), 0) m FROM messages') as { m: number }).m
  if (accountId != null) await syncAccount(db, accountId)
  else await syncAllAccounts(db, (id) => idleEnabled() && isIdleHealthy(id))
  broadcastMailChanged()
  // With the focused inbox on, only Focused mail notifies — Other stays quiet.
  const focusedOnly = appSetting('focused-inbox') === 'on' ? ' AND is_focused = 1' : ''
  const rows = db.all(
    `SELECT id FROM messages WHERE id > ? AND is_read = 0 AND is_muted = 0${focusedOnly} AND folder_id IN (SELECT id FROM folders WHERE role = 'inbox') ORDER BY id`,
    [before]
  ) as unknown as { id: number }[]
  if (rows.length) notifyNewMail(rows.map((r) => r.id))
}

function safeSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function appSetting(key: string): string | null {
  const row = db.get('SELECT value FROM app_settings WHERE key = ?', [key]) as { value: string | null } | undefined
  return row?.value ?? null
}

// Attachment cache cap in MB (Settings → Local storage; 0 = unlimited).
function attachmentCacheMb(): number {
  const n = Number(appSetting('attachment-cache-mb') ?? '500')
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 500
}
// Evict oldest downloaded attachments over budget; open message windows are safe.
function sweepAttachments(): { evicted: number; bytesUsed: number } {
  return sweepAttachmentCache(db, attachmentCacheMb() * 1024 * 1024, new Set(messageWindows.keys()))
}

// Undo-send window in seconds (Settings → Sending; 0 = off, send immediately).
function undoSeconds(): number {
  const n = Number(appSetting('undo-send-seconds') ?? '10')
  return Number.isFinite(n) ? Math.max(0, Math.min(120, Math.round(n))) : 10
}

// --- IMAP IDLE (instant new mail) — on unless turned off in Settings ----------
const idleEnabled = (): boolean => appSetting('imap-idle') !== 'off'

// Start (or stop) the per-account IDLE connections to match the setting.
// Safe to call repeatedly: startIdle is a no-op for an account already idling.
function applyIdleConfig(): void {
  if (!idleEnabled()) {
    stopAllIdle()
    return
  }
  const rows = db.all("SELECT id FROM accounts WHERE incoming_type = 'imap'") as unknown as { id: number }[]
  for (const r of rows) startIdle(db, r.id, () => void syncAndNotify(r.id))
}

// Window/taskbar icon (dev). In the packaged app the exe icon comes from
// electron-builder; here it points at the build resource when present.
const iconPath = (() => {
  const p = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(p) ? p : undefined
})()

// Secure webPreferences shared by every window: no Node in the renderer,
// isolated context, sandboxed, everything via the typed preload bridge.
const securePrefs = () => ({
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
})

// Lock a window down: external links open in the browser, the app can never be
// navigated away from its own pages, and webviews are refused.
function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const current = win.webContents.getURL()
    if (url !== current) {
      e.preventDefault()
      if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    }
  })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
  // Apply the saved text-size zoom once the page is loaded.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(uiZoom))
  attachSpellcheckMenu(win)
}

// Right-click menu for editable fields: spelling suggestions + add-to-dictionary
// (Electron's built-in spellchecker underlines misspellings as you type), plus the
// usual cut/copy/paste. Works in compose and any other editable content.
function attachSpellcheckMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_e, params) => {
    if (!params.isEditable && !params.selectionText && !params.misspelledWord) return
    const t: Electron.MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions) t.push({ label: s, click: () => win.webContents.replaceMisspelling(s) })
      if (params.dictionarySuggestions.length === 0) t.push({ label: 'No suggestions', enabled: false })
      t.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' })
    }
    if (params.isEditable) t.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' })
    else if (params.selectionText) t.push({ role: 'copy' }, { role: 'selectAll' })
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win })
  })
}

// Open message windows, keyed by message id, so a second double-click focuses
// the existing window instead of opening a duplicate.
const messageWindows = new Map<number, BrowserWindow>()

function openMessageWindow(id: number): void {
  const existing = messageWindows.get(id)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const win = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 520,
    minHeight: 400,
    show: false,
    frame: false,
    backgroundColor: '#f5f5f5',
    icon: iconPath,
    title: 'DeskMail AI',
    webPreferences: securePrefs()
  })

  win.once('ready-to-show', () => win.show())
  hardenWindow(win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/message.html?id=${id}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/message.html'), { query: { id: String(id) } })
  }

  messageWindows.set(id, win)
  win.on('closed', () => messageWindows.delete(id))
}

// Compose runs in its own resizable/movable/minimisable window (like a real mail
// client), rather than as an in-app overlay. draftId is optional (editing a draft).
function openComposeWindow(draftId?: number): void {
  const win = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 460,
    minHeight: 440,
    show: false,
    frame: false,
    backgroundColor: '#f5f5f5',
    icon: iconPath,
    title: 'New message — DeskMail AI',
    webPreferences: securePrefs()
  })

  win.once('ready-to-show', () => win.show())
  hardenWindow(win)

  const query = draftId != null ? { draftId: String(draftId) } : undefined
  if (process.env['ELECTRON_RENDERER_URL']) {
    const q = draftId != null ? `?draftId=${draftId}` : ''
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/compose.html${q}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/compose.html'), { query })
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadLayoutPrefs(db))

  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    saveLayoutPrefs(db, settings)
  })

  ipcMain.on('message-window:open', (_e, id: number) => openMessageWindow(id))
  ipcMain.on('compose-window:open', (_e, draftId?: number) => openComposeWindow(draftId))

  // --- Account setup + connection testing (Stage 4) ---------------------------
  ipcMain.handle('account:list', () => listAccounts(db))
  ipcMain.handle('account:test-incoming', (_e, cfg: ConnectionConfig) => testIncoming(cfg))
  ipcMain.handle('account:test-outgoing', (_e, cfg: ConnectionConfig) => testOutgoing(cfg))
  ipcMain.handle('account:save', (_e, input: AccountInput) => {
    const id = insertAccount(db, input)
    storeCredential(db, id, input.password) // encrypted; plaintext never persisted
    ensureDefaultSignature(db, id, input.displayName)
    ensureStandardFolders(db, id) // show the full folder tree immediately, pre-sync
    // Kick off a background sync for the new account; don't block the response.
    void syncAccount(db, id).finally(() => {
      broadcastMailChanged()
      applyIdleConfig() // start push notifications for the new account
    })
    return { id }
  })
  // Full details for editing — password decrypted from the credential store so
  // the wizard can prefill it and re-test without the user retyping it.
  ipcMain.handle('account:get', (_e, id: number) => {
    const acc = getAccount(db, id)
    if (!acc) return null
    return { ...acc, password: getCredential(db, id) ?? '' }
  })
  ipcMain.handle('account:update', (_e, id: number, input: AccountInput) => {
    updateAccount(db, id, input)
    if (input.password) storeCredential(db, id, input.password) // only if re-entered
    // Re-sync in case the fix was to the incoming settings.
    void syncAccount(db, id).finally(broadcastMailChanged)
    return { id }
  })

  // --- Mail data + sync (Stage 5) ---------------------------------------------
  ipcMain.handle('mail:list-folders', (_e, accountId?: number) => listFolders(db, accountId))
  ipcMain.handle('mail:list-messages', (_e, folderId: number) => listMessages(db, folderId))
  ipcMain.handle('mail:list-unified', () => listUnifiedInbox(db))
  ipcMain.handle('mail:search', (_e, query: string) => searchMessages(db, query))
  ipcMain.handle('mail:get-message', (_e, id: number) => getMessage(db, id))
  ipcMain.handle('mail:mark-read', (_e, id: number, read: boolean) => {
    markRead(db, id, read)
    broadcastMailChanged() // so the main list refreshes even when marked from a pop-out window
  })
  ipcMain.handle('mail:action', (_e, messageId: number, op: MailOp, targetFolderId?: number) => {
    // Capture the source folder role before the move, so "not junk" (junk→inbox)
    // can teach the Bayesian filter. Only user actions train it — never auto-junk.
    const sourceRole =
      op === 'move'
        ? (db.get("SELECT role FROM folders WHERE id = (SELECT folder_id FROM messages WHERE id = ?)", [messageId]) as { role: string | null } | undefined)?.role
        : null
    applyAction(db, messageId, op, targetFolderId)
    if (op === 'junk') trainBayesFromMessage(db, messageId, true)
    else if (op === 'move' && sourceRole === 'junk') trainBayesFromMessage(db, messageId, false)
    broadcastMailChanged()
    void drainMailActions(db) // push to IMAP in the background; never blocks the UI
  })
  ipcMain.handle('mail:sync', async (_e, accountId?: number) => {
    if (accountId) await syncAccount(db, accountId)
    else await syncAllAccounts(db)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:mark-folder-read', (_e, folderId: number) => {
    const n = markFolderRead(db, folderId)
    refreshFolderCounts(db, folderId)
    broadcastMailChanged()
    return { count: n }
  })
  ipcMain.handle('mail:set-followup', (_e, messageId: number, option: SnoozeOption | 'clear') => {
    setFollowup(db, messageId, option === 'clear' ? null : computeSnoozeTime(option))
    broadcastMailChanged()
  })
  ipcMain.handle('mail:empty-folder', (_e, folderId: number) => {
    const n = emptyFolder(db, folderId)
    broadcastMailChanged()
    void drainMailActions(db) // push the expunges to IMAP in the background
    return { count: n }
  })

  // --- Folder management (create / rename / delete custom folders) -------------
  // DB change is immediate (snappy UI); the IMAP mailbox op is pushed best-effort.
  ipcMain.handle('mail:create-folder', (_e, accountId: number, name: string, parentId?: number | null) => {
    const id = createFolder(db, accountId, name, parentId ?? null)
    // ponytail: subfolders stay local — only top-level folders get an IMAP mailbox.
    if (parentId == null) void imapCreateFolder(db, accountId, name).finally(broadcastMailChanged)
    broadcastMailChanged()
    return { id }
  })
  ipcMain.handle('mail:move-folder', (_e, id: number, parentId: number | null) => {
    moveFolder(db, id, parentId)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:reorder-folders', (_e, ids: number[]) => {
    reorderFolders(db, ids)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:rename-folder', (_e, id: number, name: string) => {
    const f = getFolder(db, id)
    renameFolder(db, id, name)
    if (f) void imapRenameFolder(db, f.account_id, f.remote_path ?? f.name, name).finally(broadcastMailChanged)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:delete-folder', (_e, id: number) => {
    const f = getFolder(db, id)
    const moved = deleteFolder(db, id)
    if (f) void imapDeleteFolder(db, f.account_id, f.remote_path ?? f.name).finally(broadcastMailChanged)
    broadcastMailChanged()
    return { moved }
  })

  // --- Notifications / tray / Focus-DND ---------------------------------------
  ipcMain.handle('notify:get', () => getNotifySettings(db))
  ipcMain.handle('notify:set', (_e, patch: Partial<NotifySettings>) => {
    const map: Record<keyof NotifySettings, { key: string; enc: (v: unknown) => string }> = {
      enabled: { key: 'notifications-enabled', enc: (v) => (v ? 'on' : 'off') },
      minimiseToTray: { key: 'minimise-to-tray', enc: (v) => (v ? 'on' : 'off') },
      dndEnabled: { key: 'dnd-enabled', enc: (v) => (v ? 'on' : 'off') },
      dndFrom: { key: 'dnd-from', enc: (v) => String(v) },
      dndTo: { key: 'dnd-to', enc: (v) => String(v) },
      focusNow: { key: 'focus-now', enc: (v) => (v ? 'on' : 'off') },
      launchAtStartup: { key: 'launch-at-startup', enc: (v) => (v ? 'on' : 'off') }
    }
    for (const k of Object.keys(patch) as (keyof NotifySettings)[]) {
      if (patch[k] !== undefined) setAppSetting(db, map[k].key, map[k].enc(patch[k]))
    }
    if (patch.launchAtStartup !== undefined) setStartup(patch.launchAtStartup)
    rebuildTrayMenu() // Focus state may have changed
    return getNotifySettings(db)
  })

  // --- Saved smart views (condition-based virtual folders) --------------------
  ipcMain.handle('smartviews:list', () => listSmartViews(db))
  ipcMain.handle('smartviews:create', (_e, input: SmartViewInput) => ({ id: createSmartView(db, input) }))
  ipcMain.handle('smartviews:delete', (_e, id: number) => {
    deleteSmartView(db, id)
    broadcastMailChanged()
  })
  ipcMain.handle('smartviews:run', (_e, id: number) => runSmartView(db, id))

  // --- Local rules / filters (run on incoming mail) ---------------------------
  ipcMain.handle('rules:list', () => listRules(db))
  ipcMain.handle('rules:create', (_e, input: RuleInput) => ({ id: createRule(db, input) }))
  ipcMain.handle('rules:update', (_e, id: number, input: RuleInput) => updateRule(db, id, input))
  ipcMain.handle('rules:delete', (_e, id: number) => deleteRule(db, id))

  // --- Local-only message flags (pin/mute) + print to PDF ----------------------
  ipcMain.handle('mail:pin', (_e, id: number, on: boolean) => {
    setPinned(db, id, on)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:mute', (_e, id: number, on: boolean) => {
    setMuted(db, id, on)
    broadcastMailChanged()
  })
  // --- Labels / tags (a message can carry several; distinct from folders) -----
  ipcMain.handle('mail:list-by-label', (_e, labelId: number) => listMessagesByLabel(db, labelId))
  ipcMain.handle('labels:list', () => listLabels(db))
  ipcMain.handle('labels:create', (_e, name: string, colour?: string) => ({ id: createLabel(db, name, colour) }))
  ipcMain.handle('labels:rename', (_e, id: number, name: string, colour?: string) => renameLabel(db, id, name, colour))
  ipcMain.handle('labels:delete', (_e, id: number) => {
    deleteLabel(db, id)
    broadcastMailChanged()
  })
  ipcMain.handle('labels:for-message', (_e, messageId: number) => labelsForMessage(db, messageId))
  ipcMain.handle('labels:toggle', (_e, messageId: number, labelId: number, on: boolean) => {
    setMessageLabel(db, messageId, labelId, on)
    broadcastMailChanged()
  })

  ipcMain.handle('mail:print-pdf', async (e, messageId: number) => {
    const m = getMessage(db, messageId)
    if (!m) return { path: null }
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const safe = (m.subject || 'message').replace(/[^\w -]+/g, '_').slice(0, 60)
    const res = await dialog.showSaveDialog(win!, {
      title: 'Save message as PDF',
      defaultPath: `${safe}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { path: null }
    await printMessageToPdf(app.getPath('userData'), m, res.filePath)
    return { path: res.filePath }
  })
  ipcMain.handle('mail:message-source', (_e, messageId: number) => {
    const m = getMessage(db, messageId)
    return m ? buildEml(m) : null
  })
  ipcMain.handle('mail:message-neighbours', (_e, messageId: number) => messageNeighbours(db, messageId))
  // Domains this mailbox has ever corresponded with (compose first-contact check).
  ipcMain.handle('mail:known-domains', () => [
    ...allKnownDomains(db),
    ...listAccounts(db).map((a) => a.emailAddress.split('@')[1] ?? '').filter(Boolean)
  ])
  // Context for the sender-signal banners (first contact / lookalike / reply-to).
  ipcMain.handle('mail:sender-context', (_e, messageId: number) => {
    const m = getMessage(db, messageId)
    return {
      priorMessagesFromSender: m?.fromEmail ? countFromSender(db, m.fromEmail, messageId) : 1,
      myDomains: listAccounts(db)
        .map((a) => a.emailAddress.split('@')[1] ?? '')
        .filter(Boolean),
      frequentDomains: topSenderDomains(db)
    }
  })
  ipcMain.handle('mail:save-message', async (e, messageId: number, format: 'eml' | 'html') => {
    const m = getMessage(db, messageId)
    if (!m) return { path: null }
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const safe = (m.subject || 'message').replace(/[^\w -]+/g, '_').slice(0, 60)
    const res = await dialog.showSaveDialog(win!, {
      title: `Save message as .${format}`,
      defaultPath: `${safe}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    if (res.canceled || !res.filePath) return { path: null }
    saveMessageFile(m, res.filePath, format)
    return { path: res.filePath }
  })
  ipcMain.handle('mail:import-mail', async (e, folderId: number) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import mail',
      properties: ['openFile'],
      filters: [{ name: 'Mail archives', extensions: ['mbox', 'eml'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { count: 0 }
    const path = res.filePaths[0]
    const count = await importMailFile(db, folderId, path, path.toLowerCase().endsWith('.eml') ? 'eml' : 'mbox')
    broadcastMailChanged()
    return { count }
  })
  ipcMain.handle('mail:export-mbox', async (e, folderId: number) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const folder = getFolder(db, folderId)
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export folder to .mbox',
      defaultPath: `${(folder?.name || 'folder').replace(/[^\w -]+/g, '_')}.mbox`,
      filters: [{ name: 'mbox', extensions: ['mbox'] }]
    })
    if (res.canceled || !res.filePath) return { count: 0, path: null }
    const count = exportMbox(db, folderId, res.filePath)
    return { count, path: res.filePath }
  })
  ipcMain.handle('contacts:import-vcf', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, { title: 'Import contacts (.vcf)', properties: ['openFile'], filters: [{ name: 'vCard', extensions: ['vcf'] }] })
    if (res.canceled || !res.filePaths[0]) return { count: 0 }
    const parsed = parseVcf(readFileSync(res.filePaths[0], 'utf-8'))
    for (const c of parsed) createContact(db, c)
    return { count: parsed.length }
  })
  ipcMain.handle('contacts:export-vcf', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showSaveDialog(win!, { title: 'Export contacts (.vcf)', defaultPath: 'contacts.vcf', filters: [{ name: 'vCard', extensions: ['vcf'] }] })
    if (res.canceled || !res.filePath) return { path: null }
    writeFileSync(res.filePath, buildVcf(listContactsDetail(db)), 'utf-8')
    return { path: res.filePath }
  })

  // --- Compose: drafts, signatures, attachments, manual send (Stage 6/8) ------
  ipcMain.handle('compose:get-signature', (_e, accountId: number) => getSignatureData(db, accountId))
  ipcMain.handle('compose:update-signature', (_e, accountId: number, body: string, appendToNew: boolean) => updateSignature(db, accountId, body, appendToNew))
  ipcMain.handle('compose:list-signatures', (_e, accountId: number) => listSignatures(db, accountId))
  ipcMain.handle('compose:create-signature', (_e, accountId: number, name: string, body: string) => ({ id: createSignature(db, accountId, name, body) }))
  ipcMain.handle('compose:update-signature-by-id', (_e, id: number, name: string, body: string) => updateSignatureById(db, id, name, body))
  ipcMain.handle('compose:delete-signature', (_e, id: number) => deleteSignature(db, id))
  ipcMain.handle('compose:set-default-signature', (_e, accountId: number, id: number) => setDefaultSignature(db, accountId, id))
  ipcMain.handle('compose:set-signature-append', (_e, accountId: number, on: boolean) => setSignatureAppend(db, accountId, on))
  ipcMain.handle('compose:save-draft', (_e, payload: ComposePayload) => ({ id: saveDraft(db, payload) }))
  ipcMain.handle('compose:list-drafts', () => listDrafts(db))
  ipcMain.handle('compose:get-draft', (_e, id: number) => getDraft(db, id))
  ipcMain.handle('compose:delete-draft', (_e, id: number) => deleteDraft(db, id))
  ipcMain.handle('compose:pick-attachments', async (e): Promise<ComposeAttachment[]> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (res.canceled) return []
    return res.filePaths.map((p) => ({ path: p, name: basename(p), size: safeSize(p) }))
  })
  // The ONLY path that sends mail — reached solely from the user's Send click.
  ipcMain.handle('compose:send', async (_e, payload: ComposePayload) => {
    const { raw, ...result } = await sendMail(db, payload)
    // Sent-folder copy is fire-and-forget: the send already succeeded, and a
    // failed append queues its own retry.
    if (result.ok && raw) void appendToSent(db, payload.accountId, raw, spoolDir()).then(broadcastMailChanged)
    return result
  })
  // Send-later & undo-send both queue a scheduled_send; the poller delivers it.
  ipcMain.handle('compose:schedule-send', (_e, payload: ComposePayload, sendAtIso: string) => scheduleSend(db, payload, sendAtIso))
  ipcMain.handle('compose:send-with-undo', async (_e, payload: ComposePayload) => {
    const seconds = undoSeconds()
    if (seconds === 0) {
      // Undo window turned off — send right away, same path as compose:send.
      const { raw, ...result } = await sendMail(db, payload)
      if (result.ok && raw) void appendToSent(db, payload.accountId, raw, spoolDir()).then(broadcastMailChanged)
      return { id: null, seconds, ok: result.ok, error: result.ok ? undefined : result.error }
    }
    const sendAt = new Date(Date.now() + seconds * 1000).toISOString()
    return { ...scheduleSend(db, payload, sendAt), seconds, ok: true }
  })
  ipcMain.handle('compose:undo-seconds', () => undoSeconds())
  ipcMain.handle('compose:set-undo-seconds', (_e, n: number) => {
    setAppSetting(db, 'undo-send-seconds', String(Math.max(0, Math.min(120, Math.round(n)))))
  })
  ipcMain.handle('compose:list-scheduled', () => listScheduled(db))
  ipcMain.handle('compose:cancel-scheduled', (_e, id: number) => cancelScheduled(db, id))
  ipcMain.handle('compose:retry-scheduled', (_e, id: number) => {
    retryScheduled(db, id)
    broadcastMailChanged()
  })

  // --- Snooze / Today (Stage 8) -----------------------------------------------
  ipcMain.handle('mail:snooze', (_e, messageId: number, option: SnoozeOption) => {
    snoozeMessage(db, messageId, computeSnoozeTime(option))
    broadcastMailChanged()
  })
  ipcMain.handle('mail:snooze-until', (_e, messageId: number, iso: string) => {
    snoozeMessage(db, messageId, iso)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:unsnooze', (_e, messageId: number) => {
    unsnooze(db, messageId)
    broadcastMailChanged()
  })
  ipcMain.handle('mail:today', () => {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return getTodayAgenda(db, iso, {
      includeUnread: getAppSetting(db, 'today-unread') !== 'off',
      includeStarred: getAppSetting(db, 'today-starred') === 'on'
    })
  })
  // Dismiss a "waiting on a reply" nudge (stays dismissed).
  ipcMain.handle('mail:dismiss-nudge', (_e, messageId: number) => dismissNudge(db, messageId))
  ipcMain.handle('today:get-config', () => ({
    unread: getAppSetting(db, 'today-unread') !== 'off',
    starred: getAppSetting(db, 'today-starred') === 'on'
  }))
  ipcMain.handle('today:set-config', (_e, patch: { unread?: boolean; starred?: boolean }) => {
    if (patch.unread !== undefined) setAppSetting(db, 'today-unread', patch.unread ? 'on' : 'off')
    if (patch.starred !== undefined) setAppSetting(db, 'today-starred', patch.starred ? 'on' : 'off')
  })
  // --- Lightweight tasks (Today is their surface) ------------------------------
  ipcMain.handle('tasks:list', () => listTasks(db))
  ipcMain.handle('tasks:create', (_e, title: string, dueAt?: string | null, messageId?: number | null) => ({ id: createTask(db, title, dueAt ?? null, messageId ?? null) }))
  ipcMain.handle('tasks:set-done', (_e, id: number, done: boolean) => setTaskDone(db, id, done))
  ipcMain.handle('tasks:delete', (_e, id: number) => deleteTask(db, id))

  ipcMain.handle('mail:junk-enabled', () => getAppSetting(db, 'junk-filter') !== 'off')
  ipcMain.handle('mail:set-junk-enabled', (_e, on: boolean) => setAppSetting(db, 'junk-filter', on ? 'on' : 'off'))
  // Trusted senders (always load remote images). User-visible in Settings.
  ipcMain.handle('trust:is', (_e, email: string) => isTrustedSender(db, email))
  ipcMain.handle('trust:add', (_e, email: string) => trustSender(db, email))
  ipcMain.handle('trust:remove', (_e, email: string) => untrustSender(db, email))
  ipcMain.handle('trust:list', () => listTrustedSenders(db))

  ipcMain.handle('mail:idle-enabled', () => idleEnabled())
  ipcMain.handle('mail:set-idle-enabled', (_e, on: boolean) => {
    setAppSetting(db, 'imap-idle', on ? 'on' : 'off')
    applyIdleConfig()
  })
  // Focused inbox: off by default until it has training data (honest default).
  ipcMain.handle('mail:focused-enabled', () => appSetting('focused-inbox') === 'on')
  ipcMain.handle('mail:set-focused-enabled', (_e, on: boolean) => {
    setAppSetting(db, 'focused-inbox', on ? 'on' : 'off')
    broadcastMailChanged()
  })
  // "Move to Focused/Other" — flips the flag and trains the classifier.
  ipcMain.handle('mail:set-focused', (_e, messageId: number, focused: boolean) => {
    setMessageFocused(db, messageId, focused)
    broadcastMailChanged()
  })

  // --- Attachments + NotebookLM export ----------------------------------------
  const attachDir = (messageId: number) => join(app.getPath('userData'), 'attachments', String(messageId))
  ipcMain.handle('attachments:open', async (_e, messageId: number, attachmentId: number) => {
    // Use the already-downloaded copy, or fetch from IMAP first.
    let row = listAttachmentRows(db, messageId).find((r) => r.id === attachmentId)
    if (!row?.local_path || !existsSync(row.local_path)) {
      await fetchAndSaveAttachments(db, messageId, attachDir(messageId))
      row = listAttachmentRows(db, messageId).find((r) => r.id === attachmentId)
      sweepAttachments() // keep the cache under its cap after each download
    }
    if (!row?.local_path || !existsSync(row.local_path)) {
      return { ok: false, error: "I couldn't download that attachment — the account may be offline." }
    }
    const err = await shell.openPath(row.local_path) // opens with the OS default app (explicit user action)
    return err ? { ok: false, error: err } : { ok: true }
  })
  // One searchable view of every attachment in the store.
  ipcMain.handle('attachments:browse', (_e, query?: string, offset?: number) => listAllAttachments(db, { query, offset }))

  ipcMain.handle('notebooklm:export', async (_e, messageId: number, includeAttachments: boolean) => {
    if (includeAttachments) await fetchAndSaveAttachments(db, messageId, attachDir(messageId))
    return exportForNotebookLM(db, messageId, app.getPath('userData'), includeAttachments)
  })

  // --- Templates & contacts (Stage 8) -----------------------------------------
  ipcMain.handle('templates:list', () => listTemplates(db))
  ipcMain.handle('templates:create', (_e, name: string, subject: string, body: string) => ({ id: createTemplate(db, name, subject, body) }))
  ipcMain.handle('templates:update', (_e, id: number, name: string, subject: string, body: string) => updateTemplate(db, id, name, subject, body))
  ipcMain.handle('templates:remove', (_e, id: number) => deleteTemplate(db, id))
  ipcMain.handle('contacts:list', () => listContacts(db))
  ipcMain.handle('contacts:search', (_e, query: string) => searchContacts(db, query))
  ipcMain.handle('contacts:list-detail', () => listContactsDetail(db))
  ipcMain.handle('contacts:groups', () => listContactGroups(db))
  ipcMain.handle('contacts:create', (_e, input: ContactInput) => ({ id: createContact(db, input) }))
  ipcMain.handle('contacts:update', (_e, id: number, input: ContactInput) => updateContact(db, id, input))
  ipcMain.handle('contacts:delete', (_e, id: number) => deleteContact(db, id))

  // --- Claude connector (Stage 9) ---------------------------------------------
  ipcMain.handle('mcp:info', () => {
    const serverPath = join(__dirname, 'mcp-server.js')
    const dbPath = join(app.getPath('userData'), 'deskmail.db')
    // Launch via DeskMail's own binary in Node mode — no separate Node install needed.
    const config = {
      mcpServers: {
        'deskmail-ai': {
          command: process.execPath,
          args: [serverPath],
          env: { ELECTRON_RUN_AS_NODE: '1', DESKMAIL_DB: dbPath }
        }
      }
    }
    return { configJson: JSON.stringify(config, null, 2), tools: buildTools(db).map((t) => t.name), dbPath }
  })

  // --- Local storage: backup / restore / portability info (Stage 10) ----------
  ipcMain.handle('storage:info', () => ({ dataDir: app.getPath('userData'), portable: dataDir.portable }))
  // destDir/backupDir may be passed explicitly (also lets us drive it in tests);
  // otherwise a native folder picker is shown.
  ipcMain.handle('storage:backup', async (e, destDir?: string) => {
    let dir = destDir
    if (!dir) {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const res = await dialog.showOpenDialog(win!, { title: 'Choose where to save the backup', properties: ['openDirectory', 'createDirectory'] })
      if (res.canceled || !res.filePaths[0]) return { path: null }
      dir = res.filePaths[0]
    }
    return { path: backupTo(app.getPath('userData'), dir) }
  })
  // Scheduled auto-backup config (dir + interval days), plus a folder picker.
  ipcMain.handle('storage:auto-backup-get', () => ({
    dir: getAppSetting(db, 'auto-backup-dir'),
    days: Number(getAppSetting(db, 'auto-backup-days') ?? '0')
  }))
  ipcMain.handle('storage:auto-backup-set', (_e, dir: string | null, days: number) => {
    setAppSetting(db, 'auto-backup-dir', dir ?? '')
    setAppSetting(db, 'auto-backup-days', String(days))
    checkAutoBackup(db, app.getPath('userData')) // run now if newly due
  })
  // Custom theme export/import — a .deskmailtheme file is just the CustomTheme
  // object as JSON. Imports are untrusted: validated + re-idd before use.
  ipcMain.handle('theme:export', async (e, theme: CustomTheme) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const safe = (theme.name || 'theme').replace(/[^\w -]+/g, '_').slice(0, 40)
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export theme',
      defaultPath: `${safe}.deskmailtheme`,
      filters: [{ name: 'DeskMail theme', extensions: ['deskmailtheme', 'json'] }]
    })
    if (res.canceled || !res.filePath) return { path: null }
    writeFileSync(res.filePath, JSON.stringify(theme, null, 2), 'utf-8')
    return { path: res.filePath }
  })
  ipcMain.handle('theme:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import theme',
      properties: ['openFile'],
      filters: [{ name: 'DeskMail theme', extensions: ['deskmailtheme', 'json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { theme: null }
    try {
      const theme = validateImportedTheme(JSON.parse(readFileSync(res.filePaths[0], 'utf-8')))
      return theme ? { theme } : { theme: null, error: 'Not a valid DeskMail theme file.' }
    } catch {
      return { theme: null, error: 'Not a valid DeskMail theme file.' }
    }
  })

  // Attachment cache cap (downloaded copies are re-fetchable, so evicting is safe).
  ipcMain.handle('storage:attachment-cache-get', () => ({ mb: attachmentCacheMb(), bytesUsed: sweepAttachments().bytesUsed }))
  ipcMain.handle('storage:attachment-cache-set', (_e, mb: number) => {
    setAppSetting(db, 'attachment-cache-mb', String(Math.max(0, Math.round(mb))))
    return sweepAttachments()
  })

  // One-off duplicate cleanup (same Message-ID left over from imports).
  ipcMain.handle('storage:dedupe-count', () => countDuplicateMessages(db))
  ipcMain.handle('storage:dedupe', () => {
    const r = dedupeMessages(db)
    if (r.removed > 0) broadcastMailChanged()
    return r
  })

  ipcMain.handle('storage:pick-folder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, { title: 'Choose a backup folder', properties: ['openDirectory', 'createDirectory'] })
    return { path: res.canceled ? null : res.filePaths[0] ?? null }
  })
  // Text-size zoom: apply to every open window and remember for new ones.
  ipcMain.on('ui:set-zoom', (_e, factor: number) => {
    uiZoom = factor
    for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(factor)
  })
  // Windows taskbar unread badge: the renderer draws it (canvas) and sends a PNG
  // data URL, or null to clear.
  ipcMain.on('ui:set-badge', (_e, dataUrl: string | null) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setOverlayIcon(dataUrl ? nativeImage.createFromDataURL(dataUrl) : null, dataUrl ? 'Unread mail' : '')
  })
  // Links clicked inside an email body (rendered in a sandboxed iframe) route here
  // so they open in the browser rather than dead-ending in the frame. http(s) only.
  ipcMain.on('ui:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('storage:restore', async (e, backupDir?: string) => {
    let dir = backupDir
    if (!dir) {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const res = await dialog.showOpenDialog(win!, { title: 'Choose a DeskMail backup folder to restore', properties: ['openDirectory'] })
      if (res.canceled || !res.filePaths[0]) return { ok: false }
      dir = res.filePaths[0]
    }
    // Close the DB, swap the files in, then reopen and refresh the UI.
    db.close()
    restoreFrom(dir, app.getPath('userData'))
    db = openDatabase(join(app.getPath('userData'), 'deskmail.db'))
    broadcastMailChanged()
    return { ok: true }
  })

  // --- Calendar & meetings (Stage 7) ------------------------------------------
  ipcMain.handle('calendar:list-events', (_e, from?: string, to?: string) => listEvents(db, from, to))
  ipcMain.handle('calendar:create-event', (_e, input: EventInput) => ({ id: createEvent(db, input) }))
  ipcMain.handle('calendar:update-event', (_e, id: number, input: EventInput) => updateEvent(db, id, input))
  ipcMain.handle('calendar:delete-event', (_e, id: number) => deleteEvent(db, id))
  ipcMain.handle('calendar:join', async (_e, eventId: number) => {
    const ev = getEvent(db, eventId)
    if (!ev) return
    const launchDesktopApp = appSetting('launch-desktop-app') !== 'false'
    await joinMeeting({ provider: ev.provider, joinUrl: ev.joinUrl, launchDesktopApp })
  })
  // Email a real ICS invite (METHOD:REQUEST) to an event's guests. Explicit
  // user action only — the button says exactly what it emails.
  ipcMain.handle('calendar:send-invite', async (_e, eventId: number) => {
    const ev = getEvent(db, eventId)
    if (!ev) return { ok: false as const, error: 'That event no longer exists.' }
    // Guests typed as addresses become attendees; plain names can't receive email.
    const attendees = ev.attendees.map((a) => a.email || a.name || '').filter((s) => s.includes('@')).map((email) => ({ email }))
    if (attendees.length === 0) return { ok: false as const, error: 'None of the guests look like an email address.' }
    const acc = listAccounts(db)[0] // ponytail: single-user app — first account sends invites
    if (!acc) return { ok: false as const, error: 'Add an account first.' }

    const content = buildInviteIcs({
      uid: ensureEventUid(db, eventId),
      title: ev.title,
      date: ev.date,
      start: ev.start,
      end: ev.end,
      location: ev.location,
      description: ev.notes,
      organizer: { name: acc.displayName, email: acc.emailAddress },
      attendees,
      method: 'REQUEST'
    })
    const { raw, ...result } = await sendMail(db, {
      accountId: acc.id,
      to: attendees.map((a) => a.email),
      cc: [],
      bcc: [],
      subject: `Invitation: ${ev.title}`,
      bodyHtml: `<p>You're invited: <b>${ev.title}</b> — ${ev.date}${ev.start ? ` at ${ev.start}` : ''}.</p>`,
      icalEvent: { method: 'REQUEST', content }
    })
    if (result.ok && raw) void appendToSent(db, acc.id, raw, spoolDir())
    return result
  })

  // Email an iTIP REPLY (Accepted/Tentative/Declined) to an invite's organiser.
  ipcMain.handle('calendar:respond-invite', async (_e, messageId: number, response: PartStat) => {
    const msg = getMessage(db, messageId)
    const inv = msg?.invite
    if (!msg || !inv?.organiserEmail || !inv.uid) return { ok: false as const, error: "I can't tell who organised this invite." }
    const accounts = listAccounts(db)
    const acc = accounts.find((a) => a.id === msg.accountId) ?? accounts[0]
    if (!acc) return { ok: false as const, error: 'Add an account first.' }
    const me = { name: acc.displayName, email: acc.emailAddress }

    const content = buildInviteIcs({
      uid: inv.uid,
      title: inv.title,
      date: inv.date,
      start: inv.start,
      end: inv.end,
      location: inv.location,
      organizer: { name: inv.organiser ?? inv.organiserEmail, email: inv.organiserEmail },
      attendees: [{ email: me.email, name: me.name }],
      method: 'REPLY',
      myResponse: response
    })
    const label = response === 'ACCEPTED' ? 'Accepted' : response === 'TENTATIVE' ? 'Tentative' : 'Declined'
    const { raw, ...result } = await sendMail(db, {
      accountId: acc.id,
      to: [inv.organiserEmail],
      cc: [],
      bcc: [],
      subject: `${label}: ${inv.title}`,
      bodyHtml: `<p>${label}: <b>${inv.title}</b></p>`,
      icalEvent: { method: 'REPLY', content }
    })
    if (result.ok && raw) void appendToSent(db, acc.id, raw, spoolDir())
    return result
  })

  // Accept an email invite → create a calendar event from its parsed data.
  ipcMain.handle('calendar:accept-invite', (_e, messageId: number) => {
    const msg = getMessage(db, messageId)
    if (!msg?.invite) return null
    const inv = msg.invite
    const id = createEvent(db, {
      title: inv.title,
      date: inv.date,
      start: inv.start,
      end: inv.end,
      provider: inv.provider,
      location: inv.location,
      joinUrl: inv.joinUrl,
      notes: null,
      calendar: 'Invitations',
      guests: inv.guests,
      recurFreq: 'none',
      recurUntil: null
    })
    return { id }
  })

  // Window controls for the custom (frameless) title bar — operate on whichever
  // window sent the request, so message windows close independently.
  ipcMain.on('window:minimise', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:toggle-maximise', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}

function createMainWindow(hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#f5f5f5',
    icon: iconPath,
    title: 'DeskMail AI',
    webPreferences: securePrefs()
  })

  // Open maximised (full screen, title bar + taskbar still visible). The width/
  // height above become the restored-down size. When started hidden (launched at
  // Windows sign-in), stay in the tray until the user opens it.
  win.once('ready-to-show', () => {
    if (hidden) return
    win.maximize()
    win.show()
  })
  hardenWindow(win)

  // Minimise / close to tray when enabled — the window hides instead of quitting,
  // and stays reachable from the tray. Off by default (close quits as usual).
  win.on('minimize', () => {
    if (appSetting('minimise-to-tray') === 'on') win.hide()
  })
  win.on('close', (e) => {
    if (!isQuitting && appSetting('minimise-to-tray') === 'on') {
      e.preventDefault()
      win.hide()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  return win
}

// Register (or clear) the OS login item. The --hidden arg makes a startup launch
// come up in the background (tray) rather than popping the window open — see the
// argv check in createMainWindow.
function setStartup(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}

// Apply the "start with Windows" preference to the OS login item. Defaults ON:
// on first run (no stored value) DeskMail registers itself to launch at startup
// and records that default, so the Settings toggle shows it as on.
function applyLaunchAtStartup(): void {
  const stored = getAppSetting(db, 'launch-at-startup')
  if (stored == null) setAppSetting(db, 'launch-at-startup', 'on')
  setStartup(stored !== 'off')
}

// Single instance: toast buttons and protocol links launch a second process on
// Windows — hand the URL to the running app instead of starting another.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
}
app.on('second-instance', (_e, argv) => {
  // A protocol action handles itself quietly; anything else focuses the window.
  if (!handleProtocolArgs(argv)) showMainWindow()
})

app.whenReady().then(async () => {
  // Windows attributes desktop notifications (and their icon) to this AppUserModelID;
  // it must match the installer's appId so the toast reads "DeskMail AI" with our
  // logo, not the default "electron.app.DeskMail AI".
  app.setAppUserModelId('uk.co.functional3d.deskmail')
  // Toast quick actions come back to us as deskmail:// activations.
  app.setAsDefaultProtocolClient('deskmail')
  // British English spellcheck for compose (falls back gracefully if unavailable).
  try {
    session.defaultSession.setSpellCheckerLanguages(['en-GB'])
  } catch {
    /* some platforms use the OS spellchecker and reject explicit languages */
  }
  // Custom title bar lives in the renderer, so no native menu bar.
  Menu.setApplicationMenu(null)
  await initDatabase()
  applyLaunchAtStartup()
  uiZoom = loadLayoutPrefs(db).fontScale // apply the saved text size to all windows
  registerIpc()
  // A Windows sign-in launch passes --hidden (see setStartup) so we come up in
  // the tray, syncing quietly, instead of opening the window.
  createMainWindow(process.argv.includes('--hidden'))
  // First launch may itself carry a toast/protocol argument.
  handleProtocolArgs(process.argv)

  if (corruptDbBackupPath) {
    void dialog.showMessageBox({
      type: 'warning',
      title: 'DeskMail AI',
      message: 'Your mail database was damaged, so I set it aside and started fresh.',
      detail: `The damaged file is kept at:\n${corruptDbBackupPath}\n\nIf you have a backup, restore it from Settings → Local storage. Your mail on the server re-syncs automatically either way.`
    })
  }

  sweepAttachments() // enforce the attachment-cache cap on launch

  // Scheduled local backup: check on launch, then hourly.
  checkAutoBackup(db, app.getPath('userData'))
  setInterval(() => checkAutoBackup(db, app.getPath('userData')), 60 * 60 * 1000)

  createTray()

  // Background sync on launch (non-blocking); refresh the UI when it lands,
  // then hold IDLE connections so new mail arrives instantly (poll = fallback).
  void syncAllAccounts(db).then(() => {
    broadcastMailChanged()
    applyIdleConfig()
  })
  startScheduledSender()
  // Periodic sync that surfaces new inbox mail as desktop notifications.
  setInterval(() => void syncAndNotify(), 2 * 60 * 1000)
  // Event reminders: check once a minute for anything starting soon.
  checkEventReminders()
  setInterval(checkEventReminders, 60 * 1000)
  // Drain queued mail actions to IMAP periodically (offline changes reconcile,
  // and any actions Claude queued via MCP get pushed + reflected in the UI).
  setInterval(() => {
    void drainMailActions(db).then((n) => {
      if (n > 0) broadcastMailChanged()
    })
  }, 20000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // With minimise-to-tray the window only hides, so this won't fire; when it
  // does (normal close), quit as usual off macOS.
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  isQuitting = true
  stopAllIdle()
  closePool() // polite IMAP logout for the pooled connections
})
