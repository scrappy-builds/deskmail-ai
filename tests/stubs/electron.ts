// Test-only stub for the `electron` module, aliased in vitest.config.ts.
//
// Unit tests exercise pure logic in main-process modules that happen to import
// electron (e.g. shell, safeStorage). They must NOT load the real electron
// package, whose entry throws unless the platform binary was downloaded into
// node_modules/electron/dist — which isn't needed (or present) in CI / a fresh
// clone. Tests that need specific electron behaviour still `vi.mock('electron')`
// themselves; that takes precedence over this stub.
import { tmpdir } from 'node:os'

const noop = (): void => {}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (s: string): Buffer => Buffer.from(s, 'utf-8'),
  decryptString: (b: Buffer): string => b.toString('utf-8')
}
export const shell = { openExternal: async (): Promise<void> => {}, openPath: async (): Promise<string> => '', showItemInFolder: noop }
export const app = {
  getPath: (): string => tmpdir(),
  getName: (): string => 'DeskMail AI',
  getVersion: (): string => '0.0.0',
  on: noop,
  whenReady: async (): Promise<void> => {},
  setAppUserModelId: noop,
  setAsDefaultProtocolClient: (): boolean => true,
  requestSingleInstanceLock: (): boolean => true
}
export class BrowserWindow {
  static getAllWindows(): unknown[] { return [] }
  on = noop
  webContents = { send: noop, on: noop, printToPDF: async (): Promise<Buffer> => Buffer.alloc(0) }
  loadURL = noop
  close = noop
}
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true, filePath: undefined }) }
export const session = { defaultSession: { webRequest: { onBeforeSendHeaders: noop } } }
export const nativeImage = {
  createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }),
  createEmpty: () => ({ isEmpty: () => true, resize: () => ({}) })
}
export const ipcMain = { handle: noop, on: noop }
export const ipcRenderer = { invoke: async (): Promise<undefined> => undefined, send: noop, on: noop, removeListener: noop }
export const contextBridge = { exposeInMainWorld: noop }
export const Menu = { setApplicationMenu: noop, buildFromTemplate: () => ({}) }
export class Notification { show = noop; on = noop }
export class Tray { setToolTip = noop; setContextMenu = noop; on = noop; destroy = noop }

export default { safeStorage, shell, app, BrowserWindow, dialog, session, nativeImage, ipcMain, ipcRenderer, contextBridge, Menu, Notification, Tray }
