import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { loadSettings } from './settings'
import { openDatabase, type DB } from '../db/database'
import { loadLayoutPrefs, saveLayoutPrefs, seedLayoutIfEmpty } from '../db/settings'
import { insertAccount, listAccounts } from '../db/accounts'
import { storeCredential } from './credentials'
import { testIncoming, testOutgoing } from './mail/connectionTest'
import type { AppSettings } from '@shared/types'
import type { AccountInput, ConnectionConfig } from '@shared/db'

// Allow an override data directory (used by E2E tests now; the basis for
// portable/USB mode in Stage 10). Must be set before the app is ready.
const overrideUserData = process.env.DESKMAIL_USER_DATA
if (overrideUserData) app.setPath('userData', overrideUserData)

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

let db: DB

// Open the SQLite store and, on first run, import the Stage 1–3 settings.json.
function initDatabase(): void {
  db = openDatabase(join(app.getPath('userData'), 'deskmail.db'))
  const legacy = existsSync(settingsPath()) ? loadSettings(settingsPath()) : null
  seedLayoutIfEmpty(db, legacy)
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

app.whenReady().then(() => {
  // Custom title bar lives in the renderer, so no native menu bar.
  Menu.setApplicationMenu(null)
  initDatabase()
  registerIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
