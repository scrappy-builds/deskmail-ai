import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DeskMailApi, Theme } from '@shared/types'

// The only surface the renderer can touch. No Node, no ipcRenderer directly —
// just these typed methods.
const api: DeskMailApi = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setTheme: (theme: Theme): Promise<void> => ipcRenderer.invoke('settings:set-theme', theme),
  window: {
    minimise: () => ipcRenderer.send('window:minimise'),
    toggleMaximise: () => ipcRenderer.send('window:toggle-maximise'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('deskmail', api)
