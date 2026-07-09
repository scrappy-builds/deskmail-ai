import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DeskMailApi } from '@shared/types'
import type { AccountInput, ConnectionConfig } from '@shared/db'

// The only surface the renderer can touch. No Node, no ipcRenderer directly —
// just these typed methods.
const api: DeskMailApi = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
  openMessage: (id: number): void => ipcRenderer.send('message-window:open', id),
  listAccounts: () => ipcRenderer.invoke('account:list'),
  testIncoming: (config: ConnectionConfig) => ipcRenderer.invoke('account:test-incoming', config),
  testOutgoing: (config: ConnectionConfig) => ipcRenderer.invoke('account:test-outgoing', config),
  saveAccount: (input: AccountInput) => ipcRenderer.invoke('account:save', input),
  mail: {
    listFolders: (accountId?: number) => ipcRenderer.invoke('mail:list-folders', accountId),
    listMessages: (folderId: number) => ipcRenderer.invoke('mail:list-messages', folderId),
    getMessage: (id: number) => ipcRenderer.invoke('mail:get-message', id),
    markRead: (id: number, read: boolean) => ipcRenderer.invoke('mail:mark-read', id, read),
    sync: (accountId?: number) => ipcRenderer.invoke('mail:sync', accountId),
    onChanged: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('mail:changed', listener)
      return () => ipcRenderer.removeListener('mail:changed', listener)
    }
  },
  window: {
    minimise: () => ipcRenderer.send('window:minimise'),
    toggleMaximise: () => ipcRenderer.send('window:toggle-maximise'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('deskmail', api)
