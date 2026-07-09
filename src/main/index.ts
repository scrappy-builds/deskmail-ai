import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app, dialog, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { loadSettings } from './settings'
import { openDatabase, type DB } from '../db/database'
import { loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty } from '../db/settings'
import { insertAccount, listAccounts } from '../db/accounts'
import { listFolders } from '../db/folders'
import { getMessage, listMessages, markRead, searchMessages } from '../db/messages'
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../db/drafts'
import { ensureDefaultSignature, getDefaultSignature } from '../db/signatures'
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../db/events'
import { storeCredential } from './credentials'
import { testIncoming, testOutgoing } from './mail/connectionTest'
import { syncAccount, syncAllAccounts } from './mail/sync'
import { sendMail } from './mail/send'
import { joinMeeting } from './meetings'
import { maybeSeedDemo } from './mail/demoSeed'
import type { AppSettings } from '@shared/types'
import type { AccountInput, ComposeAttachment, ComposePayload, ConnectionConfig, EventInput } from '@shared/db'

// Allow an override data directory (used by E2E tests now; the basis for
// portable/USB mode in Stage 10). Must be set before the app is ready.
const overrideUserData = process.env.DESKMAIL_USER_DATA
if (overrideUserData) app.setPath('userData', overrideUserData)

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

let db: DB

// Open the SQLite store and, on first run, import the Stage 1–3 settings.json.
async function initDatabase(): Promise<void> {
  db = openDatabase(join(app.getPath('userData'), 'deskmail.db'))
  const legacy = existsSync(settingsPath()) ? loadSettings(settingsPath()) : null
  seedLayoutIfEmpty(db, legacy)
  await maybeSeedDemo(db)
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

// Secure webPreferences shared by every window: no Node in the renderer,
// isolated context, sandboxed, everything via the typed preload bridge.
const securePrefs = () => ({
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
})

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
    title: 'DeskMail AI',
    webPreferences: securePrefs()
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

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
  ipcMain.handle('mail:sync', async (_e, accountId?: number) => {
    if (accountId) await syncAccount(db, accountId)
    else await syncAllAccounts(db)
    broadcastMailChanged()
  })

  // --- Compose: drafts, signatures, attachments, manual send (Stage 6) --------
  ipcMain.handle('compose:get-signature', (_e, accountId: number) => getDefaultSignature(db, accountId))
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
    title: 'DeskMail AI',
    webPreferences: securePrefs()
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
