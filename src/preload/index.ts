import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DeskMailApi } from '@shared/types'
import type { CustomTheme } from '@shared/theme'
import type { AccountInput, ComposePayload, ConnectionConfig, ContactInput, EventInput, MailOp, NotifySettings, RuleInput, SmartViewInput, SnoozeOption } from '@shared/db'

// The only surface the renderer can touch. No Node, no ipcRenderer directly —
// just these typed methods.
const api: DeskMailApi = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
  openMessage: (id: number): void => ipcRenderer.send('message-window:open', id),
  openCompose: (draftId?: number): void => ipcRenderer.send('compose-window:open', draftId),
  listAccounts: () => ipcRenderer.invoke('account:list'),
  testIncoming: (config: ConnectionConfig) => ipcRenderer.invoke('account:test-incoming', config),
  testOutgoing: (config: ConnectionConfig) => ipcRenderer.invoke('account:test-outgoing', config),
  saveAccount: (input: AccountInput) => ipcRenderer.invoke('account:save', input),
  getAccount: (id: number) => ipcRenderer.invoke('account:get', id),
  updateAccount: (id: number, input: AccountInput) => ipcRenderer.invoke('account:update', id, input),
  mail: {
    listFolders: (accountId?: number) => ipcRenderer.invoke('mail:list-folders', accountId),
    listMessages: (folderId: number) => ipcRenderer.invoke('mail:list-messages', folderId),
    listUnified: () => ipcRenderer.invoke('mail:list-unified'),
    search: (query: string) => ipcRenderer.invoke('mail:search', query),
    getMessage: (id: number) => ipcRenderer.invoke('mail:get-message', id),
    markRead: (id: number, read: boolean) => ipcRenderer.invoke('mail:mark-read', id, read),
    action: (messageId: number, op: MailOp, targetFolderId?: number) => ipcRenderer.invoke('mail:action', messageId, op, targetFolderId),
    markFolderRead: (folderId: number) => ipcRenderer.invoke('mail:mark-folder-read', folderId),
    emptyFolder: (folderId: number) => ipcRenderer.invoke('mail:empty-folder', folderId),
    sync: (accountId?: number) => ipcRenderer.invoke('mail:sync', accountId),
    createFolder: (accountId: number, name: string, parentId?: number | null) => ipcRenderer.invoke('mail:create-folder', accountId, name, parentId),
    renameFolder: (id: number, name: string) => ipcRenderer.invoke('mail:rename-folder', id, name),
    deleteFolder: (id: number) => ipcRenderer.invoke('mail:delete-folder', id),
    moveFolder: (id: number, parentId: number | null) => ipcRenderer.invoke('mail:move-folder', id, parentId),
    reorderFolders: (ids: number[]) => ipcRenderer.invoke('mail:reorder-folders', ids),
    pin: (id: number, on: boolean) => ipcRenderer.invoke('mail:pin', id, on),
    mute: (id: number, on: boolean) => ipcRenderer.invoke('mail:mute', id, on),
    printPdf: (id: number) => ipcRenderer.invoke('mail:print-pdf', id),
    messageSource: (id: number) => ipcRenderer.invoke('mail:message-source', id),
    messageNeighbours: (id: number) => ipcRenderer.invoke('mail:message-neighbours', id),
    senderContext: (id: number) => ipcRenderer.invoke('mail:sender-context', id),
    knownDomains: () => ipcRenderer.invoke('mail:known-domains'),
    saveMessage: (id: number, format: 'eml' | 'html') => ipcRenderer.invoke('mail:save-message', id, format),
    importMail: (folderId: number) => ipcRenderer.invoke('mail:import-mail', folderId),
    exportMbox: (folderId: number) => ipcRenderer.invoke('mail:export-mbox', folderId),
    listByLabel: (labelId: number) => ipcRenderer.invoke('mail:list-by-label', labelId),
    onChanged: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('mail:changed', listener)
      return () => ipcRenderer.removeListener('mail:changed', listener)
    },
    snooze: (messageId: number, option: SnoozeOption) => ipcRenderer.invoke('mail:snooze', messageId, option),
    setFollowup: (messageId: number, option: SnoozeOption | 'clear') => ipcRenderer.invoke('mail:set-followup', messageId, option),
    snoozeUntil: (messageId: number, iso: string) => ipcRenderer.invoke('mail:snooze-until', messageId, iso),
    unsnooze: (messageId: number) => ipcRenderer.invoke('mail:unsnooze', messageId),
    today: () => ipcRenderer.invoke('mail:today'),
    todayConfigGet: () => ipcRenderer.invoke('today:get-config'),
    todayConfigSet: (patch: { unread?: boolean; starred?: boolean }) => ipcRenderer.invoke('today:set-config', patch),
    junkEnabled: () => ipcRenderer.invoke('mail:junk-enabled'),
    setJunkEnabled: (on: boolean) => ipcRenderer.invoke('mail:set-junk-enabled', on),
    idleEnabled: () => ipcRenderer.invoke('mail:idle-enabled'),
    setIdleEnabled: (on: boolean) => ipcRenderer.invoke('mail:set-idle-enabled', on)
  },
  compose: {
    getSignature: (accountId: number) => ipcRenderer.invoke('compose:get-signature', accountId),
    updateSignature: (accountId: number, body: string, appendToNew: boolean) => ipcRenderer.invoke('compose:update-signature', accountId, body, appendToNew),
    listSignatures: (accountId: number) => ipcRenderer.invoke('compose:list-signatures', accountId),
    createSignature: (accountId: number, name: string, body: string) => ipcRenderer.invoke('compose:create-signature', accountId, name, body),
    updateSignatureById: (id: number, name: string, body: string) => ipcRenderer.invoke('compose:update-signature-by-id', id, name, body),
    deleteSignature: (id: number) => ipcRenderer.invoke('compose:delete-signature', id),
    setDefaultSignature: (accountId: number, id: number) => ipcRenderer.invoke('compose:set-default-signature', accountId, id),
    setSignatureAppend: (accountId: number, on: boolean) => ipcRenderer.invoke('compose:set-signature-append', accountId, on),
    saveDraft: (payload: ComposePayload) => ipcRenderer.invoke('compose:save-draft', payload),
    listDrafts: () => ipcRenderer.invoke('compose:list-drafts'),
    getDraft: (id: number) => ipcRenderer.invoke('compose:get-draft', id),
    deleteDraft: (id: number) => ipcRenderer.invoke('compose:delete-draft', id),
    pickAttachments: () => ipcRenderer.invoke('compose:pick-attachments'),
    send: (payload: ComposePayload) => ipcRenderer.invoke('compose:send', payload),
    scheduleSend: (payload: ComposePayload, sendAtIso: string) => ipcRenderer.invoke('compose:schedule-send', payload, sendAtIso),
    sendWithUndo: (payload: ComposePayload) => ipcRenderer.invoke('compose:send-with-undo', payload),
    undoSeconds: () => ipcRenderer.invoke('compose:undo-seconds'),
    setUndoSeconds: (n: number) => ipcRenderer.invoke('compose:set-undo-seconds', n),
    listScheduled: () => ipcRenderer.invoke('compose:list-scheduled'),
    cancelScheduled: (id: number) => ipcRenderer.invoke('compose:cancel-scheduled', id),
    retryScheduled: (id: number) => ipcRenderer.invoke('compose:retry-scheduled', id)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    create: (title: string, dueAt?: string | null, messageId?: number | null) => ipcRenderer.invoke('tasks:create', title, dueAt, messageId),
    setDone: (id: number, done: boolean) => ipcRenderer.invoke('tasks:set-done', id, done),
    remove: (id: number) => ipcRenderer.invoke('tasks:delete', id)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    create: (name: string, subject: string, body: string) => ipcRenderer.invoke('templates:create', name, subject, body),
    update: (id: number, name: string, subject: string, body: string) => ipcRenderer.invoke('templates:update', id, name, subject, body),
    remove: (id: number) => ipcRenderer.invoke('templates:remove', id)
  },
  contacts: {
    list: () => ipcRenderer.invoke('contacts:list'),
    search: (query: string) => ipcRenderer.invoke('contacts:search', query),
    listDetail: () => ipcRenderer.invoke('contacts:list-detail'),
    groups: () => ipcRenderer.invoke('contacts:groups'),
    create: (input: ContactInput) => ipcRenderer.invoke('contacts:create', input),
    update: (id: number, input: ContactInput) => ipcRenderer.invoke('contacts:update', id, input),
    remove: (id: number) => ipcRenderer.invoke('contacts:delete', id),
    importVcf: () => ipcRenderer.invoke('contacts:import-vcf'),
    exportVcf: () => ipcRenderer.invoke('contacts:export-vcf')
  },
  smartViews: {
    list: () => ipcRenderer.invoke('smartviews:list'),
    create: (input: SmartViewInput) => ipcRenderer.invoke('smartviews:create', input),
    remove: (id: number) => ipcRenderer.invoke('smartviews:delete', id),
    run: (id: number) => ipcRenderer.invoke('smartviews:run', id)
  },
  rules: {
    list: () => ipcRenderer.invoke('rules:list'),
    create: (input: RuleInput) => ipcRenderer.invoke('rules:create', input),
    update: (id: number, input: RuleInput) => ipcRenderer.invoke('rules:update', id, input),
    remove: (id: number) => ipcRenderer.invoke('rules:delete', id)
  },
  labels: {
    list: () => ipcRenderer.invoke('labels:list'),
    create: (name: string, colour?: string) => ipcRenderer.invoke('labels:create', name, colour),
    rename: (id: number, name: string, colour?: string) => ipcRenderer.invoke('labels:rename', id, name, colour),
    remove: (id: number) => ipcRenderer.invoke('labels:delete', id),
    forMessage: (messageId: number) => ipcRenderer.invoke('labels:for-message', messageId),
    toggle: (messageId: number, labelId: number, on: boolean) => ipcRenderer.invoke('labels:toggle', messageId, labelId, on)
  },
  mcp: {
    info: () => ipcRenderer.invoke('mcp:info')
  },
  trust: {
    is: (email: string) => ipcRenderer.invoke('trust:is', email),
    add: (email: string) => ipcRenderer.invoke('trust:add', email),
    remove: (email: string) => ipcRenderer.invoke('trust:remove', email),
    list: () => ipcRenderer.invoke('trust:list')
  },
  attachments: {
    open: (messageId: number, attachmentId: number) => ipcRenderer.invoke('attachments:open', messageId, attachmentId),
    browse: (query?: string, offset?: number) => ipcRenderer.invoke('attachments:browse', query, offset)
  },
  notebooklm: {
    export: (messageId: number, includeAttachments: boolean) => ipcRenderer.invoke('notebooklm:export', messageId, includeAttachments)
  },
  storage: {
    info: () => ipcRenderer.invoke('storage:info'),
    backup: (destDir?: string) => ipcRenderer.invoke('storage:backup', destDir),
    restore: (backupDir?: string) => ipcRenderer.invoke('storage:restore', backupDir),
    autoBackupGet: () => ipcRenderer.invoke('storage:auto-backup-get'),
    autoBackupSet: (dir: string | null, days: number) => ipcRenderer.invoke('storage:auto-backup-set', dir, days),
    pickFolder: () => ipcRenderer.invoke('storage:pick-folder'),
    dedupeCount: () => ipcRenderer.invoke('storage:dedupe-count'),
    dedupe: () => ipcRenderer.invoke('storage:dedupe'),
    attachmentCacheGet: () => ipcRenderer.invoke('storage:attachment-cache-get'),
    attachmentCacheSet: (mb: number) => ipcRenderer.invoke('storage:attachment-cache-set', mb)
  },
  theme: {
    export: (theme: CustomTheme) => ipcRenderer.invoke('theme:export', theme),
    import: () => ipcRenderer.invoke('theme:import')
  },
  setZoom: (factor: number) => ipcRenderer.send('ui:set-zoom', factor),
  notify: {
    get: () => ipcRenderer.invoke('notify:get'),
    set: (patch: Partial<NotifySettings>) => ipcRenderer.invoke('notify:set', patch)
  },
  calendar: {
    listEvents: (from?: string, to?: string) => ipcRenderer.invoke('calendar:list-events', from, to),
    createEvent: (input: EventInput) => ipcRenderer.invoke('calendar:create-event', input),
    updateEvent: (id: number, input: EventInput) => ipcRenderer.invoke('calendar:update-event', id, input),
    deleteEvent: (id: number) => ipcRenderer.invoke('calendar:delete-event', id),
    join: (eventId: number) => ipcRenderer.invoke('calendar:join', eventId),
    acceptInvite: (messageId: number) => ipcRenderer.invoke('calendar:accept-invite', messageId),
    sendInvite: (eventId: number) => ipcRenderer.invoke('calendar:send-invite', eventId),
    respondInvite: (messageId: number, response: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED') => ipcRenderer.invoke('calendar:respond-invite', messageId, response)
  },
  window: {
    minimise: () => ipcRenderer.send('window:minimise'),
    toggleMaximise: () => ipcRenderer.send('window:toggle-maximise'),
    close: () => ipcRenderer.send('window:close')
  },
  // Set (or clear with null) the Windows taskbar unread overlay badge (a PNG data URL).
  setBadge: (dataUrl: string | null) => ipcRenderer.send('ui:set-badge', dataUrl),
  // Open an http(s) link (e.g. from an email body) in the default browser.
  openExternal: (url: string) => ipcRenderer.send('ui:open-external', url)
}

contextBridge.exposeInMainWorld('deskmail', api)
