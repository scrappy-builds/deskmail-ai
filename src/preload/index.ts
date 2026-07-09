import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DeskMailApi } from '@shared/types'

// The only surface the renderer can touch. No Node, no ipcRenderer directly —
// just these typed methods.
const api: DeskMailApi = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
  openMessage: (id: number): void => ipcRenderer.send('message-window:open', id),
  window: {
    minimise: () => ipcRenderer.send('window:minimise'),
    toggleMaximise: () => ipcRenderer.send('window:toggle-maximise'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('deskmail', api)
