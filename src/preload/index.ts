import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DeskMailApi } from '@shared/types'
import type { AccountInput, ComposePayload, ConnectionConfig, EventInput, MailOp, SnoozeOption } from '@shared/db'

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
    search: (query: string) => ipcRenderer.invoke('mail:search', query),
    getMessage: (id: number) => ipcRenderer.invoke('mail:get-message', id),
    markRead: (id: number, read: boolean) => ipcRenderer.invoke('mail:mark-read', id, read),
    action: (messageId: number, op: MailOp, targetFolderId?: number) => ipcRenderer.invoke('mail:action', messageId, op, targetFolderId),
    sync: (accountId?: number) => ipcRenderer.invoke('mail:sync', accountId),
    onChanged: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('mail:changed', listener)
      return () => ipcRenderer.removeListener('mail:changed', listener)
    },
    snooze: (messageId: number, option: SnoozeOption) => ipcRenderer.invoke('mail:snooze', messageId, option),
    snoozeUntil: (messageId: number, iso: string) => ipcRenderer.invoke('mail:snooze-until', messageId, iso),
    unsnooze: (messageId: number) => ipcRenderer.invoke('mail:unsnooze', messageId),
    today: () => ipcRenderer.invoke('mail:today'),
    junkEnabled: () => ipcRenderer.invoke('mail:junk-enabled'),
    setJunkEnabled: (on: boolean) => ipcRenderer.invoke('mail:set-junk-enabled', on)
  },
  compose: {
    getSignature: (accountId: number) => ipcRenderer.invoke('compose:get-signature', accountId),
    updateSignature: (accountId: number, body: string, appendToNew: boolean) => ipcRenderer.invoke('compose:update-signature', accountId, body, appendToNew),
    saveDraft: (payload: ComposePayload) => ipcRenderer.invoke('compose:save-draft', payload),
    listDrafts: () => ipcRenderer.invoke('compose:list-drafts'),
    getDraft: (id: number) => ipcRenderer.invoke('compose:get-draft', id),
    deleteDraft: (id: number) => ipcRenderer.invoke('compose:delete-draft', id),
    pickAttachments: () => ipcRenderer.invoke('compose:pick-attachments'),
    send: (payload: ComposePayload) => ipcRenderer.invoke('compose:send', payload),
    scheduleSend: (payload: ComposePayload, sendAtIso: string) => ipcRenderer.invoke('compose:schedule-send', payload, sendAtIso),
    sendWithUndo: (payload: ComposePayload) => ipcRenderer.invoke('compose:send-with-undo', payload),
    listScheduled: () => ipcRenderer.invoke('compose:list-scheduled'),
    cancelScheduled: (id: number) => ipcRenderer.invoke('compose:cancel-scheduled', id)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    create: (name: string, subject: string, body: string) => ipcRenderer.invoke('templates:create', name, subject, body),
    update: (id: number, name: string, subject: string, body: string) => ipcRenderer.invoke('templates:update', id, name, subject, body),
    remove: (id: number) => ipcRenderer.invoke('templates:remove', id)
  },
  contacts: {
    list: () => ipcRenderer.invoke('contacts:list'),
    search: (query: string) => ipcRenderer.invoke('contacts:search', query)
  },
  mcp: {
    info: () => ipcRenderer.invoke('mcp:info')
  },
  attachments: {
    open: (messageId: number, attachmentId: number) => ipcRenderer.invoke('attachments:open', messageId, attachmentId)
  },
  notebooklm: {
    export: (messageId: number, includeAttachments: boolean) => ipcRenderer.invoke('notebooklm:export', messageId, includeAttachments)
  },
  storage: {
    info: () => ipcRenderer.invoke('storage:info'),
    backup: (destDir?: string) => ipcRenderer.invoke('storage:backup', destDir),
    restore: (backupDir?: string) => ipcRenderer.invoke('storage:restore', backupDir)
  },
  calendar: {
    listEvents: (from?: string, to?: string) => ipcRenderer.invoke('calendar:list-events', from, to),
    createEvent: (input: EventInput) => ipcRenderer.invoke('calendar:create-event', input),
    updateEvent: (id: number, input: EventInput) => ipcRenderer.invoke('calendar:update-event', id, input),
    deleteEvent: (id: number) => ipcRenderer.invoke('calendar:delete-event', id),
    join: (eventId: number) => ipcRenderer.invoke('calendar:join', eventId),
    acceptInvite: (messageId: number) => ipcRenderer.invoke('calendar:accept-invite', messageId)
  },
  window: {
    minimise: () => ipcRenderer.send('window:minimise'),
    toggleMaximise: () => ipcRenderer.send('window:toggle-maximise'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('deskmail', api)
