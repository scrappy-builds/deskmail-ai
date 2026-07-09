import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app, dialog, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { loadSettings } from './settings'
import { resolveDataDir } from './dataDir'
import { backupTo, restoreFrom } from './backup'
import { openDatabase, type DB } from '../db/database'
import { getAppSetting, loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty, setAppSetting } from '../db/settings'
import { insertAccount, listAccounts } from '../db/accounts'
import { listFolders } from '../db/folders'
import { getMessage, listMessages, markRead, searchMessages } from '../db/messages'
import { applyAction } from '../db/mailActions'
import { drainMailActions } from './mail/drainer'
import { fetchAndSaveAttachments } from './mail/attachments'
import { listAttachmentRows } from '../db/messages'
import { exportForNotebookLM } from '../mcp/export'
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../db/drafts'
import { ensureDefaultSignature, getSignatureData, updateSignature } from '../db/signatures'
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../db/events'
import { cancelScheduled, dueScheduled, listScheduled, markError, markSent, scheduleSend } from '../db/scheduledSends'
import { computeSnoozeTime, snoozeMessage, unsnooze } from '../db/snoozes'
import { createTemplate, deleteTemplate, listTemplates, seedTemplatesIfEmpty, updateTemplate } from '../db/templates'
import { listContacts, searchContacts } from '../db/contacts'
import { getTodayAgenda } from '../db/today'
import { buildTools } from '../mcp/tools'
import { storeCredential } from './credentials'
import { testIncoming, testOutgoing } from './mail/connectionTest'
import { syncAccount, syncAllAccounts } from './mail/sync'
import { sendMail } from './mail/send'
import { joinMeeting } from './meetings'
import { maybeSeedDemo } from './mail/demoSeed'
import type { AppSettings } from '@shared/types'
import type { AccountInput, ComposeAttachment, ComposePayload, ConnectionConfig, EventInput, MailOp, SnoozeOption } from '@shared/db'

// Undo-send window in seconds (configurable later; sensible default now).
const UNDO_DELAY_SECONDS = 10

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

let db: DB

// Open the SQLite store and, on first run, import the Stage 1–3 settings.json.
async function initDatabase(): Promise<void> {
  db = openDatabase(join(app.getPath('userData'), 'deskmail.db'))
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
      const res = await sendMail(db, {
        accountId: draft.accountId,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject ?? '',
        bodyHtml: draft.bodyHtml ?? ''
      })
      if (res.ok) markSent(db, s.id)
      else markError(db, s.id) // ponytail: no infinite retry — mark error and move on
    }
    if (due.length) broadcastMailChanged()
  }
  setInterval(() => void tick(), 5000)
}

// Tell every open window the local mail cache changed, so it refetches.
function broadcastMailChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('mail:changed')
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

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadLayoutPrefs(db))

  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    saveLayoutPrefs(db, settings)
  })

  ipcMain.on('message-window:open', (_e, id: number) => openMessageWindow(id))

  // --- Account setup + connection testing (Stage 4) ---------------------------
  ipcMain.handle('account:list', () => listAccounts(db))
  ipcMain.handle('account:test-incoming', (_e, cfg: ConnectionConfig) => testIncoming(cfg))
  ipcMain.handle('account:test-outgoing', (_e, cfg: ConnectionConfig) => testOutgoing(cfg))
  ipcMain.handle('account:save', (_e, input: AccountInput) => {
    const id = insertAccount(db, input)
    storeCredential(db, id, input.password) // encrypted; plaintext never persisted
    ensureDefaultSignature(db, id, input.displayName)
    // Kick off a background sync for the new account; don't block the response.
    void syncAccount(db, id).finally(broadcastMailChanged)
    return { id }
  })

  // --- Mail data + sync (Stage 5) ---------------------------------------------
  ipcMain.handle('mail:list-folders', (_e, accountId?: number) => listFolders(db, accountId))
  ipcMain.handle('mail:list-messages', (_e, folderId: number) => listMessages(db, folderId))
  ipcMain.handle('mail:search', (_e, query: string) => searchMessages(db, query))
  ipcMain.handle('mail:get-message', (_e, id: number) => getMessage(db, id))
  ipcMain.handle('mail:mark-read', (_e, id: number, read: boolean) => markRead(db, id, read))
  ipcMain.handle('mail:action', (_e, messageId: number, op: MailOp, targetFolderId?: number) => {
    applyAction(db, messageId, op, targetFolderId)
    broadcastMailChanged()
    void drainMailActions(db) // push to IMAP in the background; never blocks the UI
  })
  ipcMain.handle('mail:sync', async (_e, accountId?: number) => {
    if (accountId) await syncAccount(db, accountId)
    else await syncAllAccounts(db)
    broadcastMailChanged()
  })

  // --- Compose: drafts, signatures, attachments, manual send (Stage 6/8) ------
  ipcMain.handle('compose:get-signature', (_e, accountId: number) => getSignatureData(db, accountId))
  ipcMain.handle('compose:update-signature', (_e, accountId: number, body: string, appendToNew: boolean) => updateSignature(db, accountId, body, appendToNew))
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
  ipcMain.handle('compose:send', (_e, payload: ComposePayload) => sendMail(db, payload))
  // Send-later & undo-send both queue a scheduled_send; the poller delivers it.
  ipcMain.handle('compose:schedule-send', (_e, payload: ComposePayload, sendAtIso: string) => scheduleSend(db, payload, sendAtIso))
  ipcMain.handle('compose:send-with-undo', (_e, payload: ComposePayload) => {
    const sendAt = new Date(Date.now() + UNDO_DELAY_SECONDS * 1000).toISOString()
    return scheduleSend(db, payload, sendAt)
  })
  ipcMain.handle('compose:list-scheduled', () => listScheduled(db))
  ipcMain.handle('compose:cancel-scheduled', (_e, id: number) => cancelScheduled(db, id))

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
    return getTodayAgenda(db, iso)
  })
  ipcMain.handle('mail:junk-enabled', () => getAppSetting(db, 'junk-filter') !== 'off')
  ipcMain.handle('mail:set-junk-enabled', (_e, on: boolean) => setAppSetting(db, 'junk-filter', on ? 'on' : 'off'))

  // --- Attachments + NotebookLM export ----------------------------------------
  const attachDir = (messageId: number) => join(app.getPath('userData'), 'attachments', String(messageId))
  ipcMain.handle('attachments:open', async (_e, messageId: number, attachmentId: number) => {
    // Use the already-downloaded copy, or fetch from IMAP first.
    let row = listAttachmentRows(db, messageId).find((r) => r.id === attachmentId)
    if (!row?.local_path || !existsSync(row.local_path)) {
      await fetchAndSaveAttachments(db, messageId, attachDir(messageId))
      row = listAttachmentRows(db, messageId).find((r) => r.id === attachmentId)
    }
    if (!row?.local_path || !existsSync(row.local_path)) {
      return { ok: false, error: "I couldn't download that attachment — the account may be offline." }
    }
    const err = await shell.openPath(row.local_path) // opens with the OS default app (explicit user action)
    return err ? { ok: false, error: err } : { ok: true }
  })
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
      guests: inv.guests
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

function createMainWindow(): BrowserWindow {
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

  win.once('ready-to-show', () => win.show())
  hardenWindow(win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  // Custom title bar lives in the renderer, so no native menu bar.
  Menu.setApplicationMenu(null)
  await initDatabase()
  registerIpc()
  createMainWindow()

  // Background sync on launch (non-blocking); refresh the UI when it lands.
  void syncAllAccounts(db).then(broadcastMailChanged)
  startScheduledSender()
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
  if (process.platform !== 'darwin') app.quit()
})
