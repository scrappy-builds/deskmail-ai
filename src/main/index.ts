import { join } from 'node:path'
import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { loadSettings, saveSettings } from './settings'
import type { Theme } from '@shared/types'

// Allow an override data directory (used by E2E tests now; the basis for
// portable/USB mode in Stage 10). Must be set before the app is ready.
const overrideUserData = process.env.DESKMAIL_USER_DATA
if (overrideUserData) app.setPath('userData', overrideUserData)

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings(settingsPath()))

  ipcMain.handle('settings:set-theme', (_e, theme: Theme) => {
    const current = loadSettings(settingsPath())
    saveSettings(settingsPath(), { ...current, theme })
  })

  // Window controls for the custom (frameless) title bar.
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security: renderer gets no Node access; everything goes through the preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
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
  registerIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
