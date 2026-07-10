import { create } from 'zustand'
import type { AccountSummary, FolderSummary, LabelInfo, MessageDetail, MessageListItem, SmartView } from '@shared/db'
import { useLayout } from './layoutStore'
import type { SortDir, SortField } from '../mail/sortMessages'

function loadSort(): { field: SortField; dir: SortDir } {
  try {
    const raw = localStorage.getItem('deskmail.sort')
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { field: 'date', dir: 'desc' }
}

// Mail data state — DB-backed via the IPC bridge. Reads come from the local
// SQLite cache, so the list and reading pane work offline. Kept separate from
// layout state by design.

interface MailState {
  accounts: AccountSummary[]
  folders: FolderSummary[]
  labels: LabelInfo[]
  smartViews: SmartView[]
  messages: MessageListItem[]
  activeFolderId: number | null
  activeLabelId: number | null // when set, the list shows this label's messages
  activeSmartViewId: number | null // when set, the list shows this smart view
  activeUnified: boolean // when true, the list shows all accounts' inboxes combined
  selectedId: number | null
  selected: MessageDetail | null
  selectedIds: Set<number> // multi-select for bulk actions
  syncing: boolean
  searchQuery: string
  sort: { field: SortField; dir: SortDir } // list sort, shared by header + View menu
  lastUndo: { label: string; run: () => void } | null // last reversible action

  setSort: (s: { field: SortField; dir: SortDir }) => void
  setUndo: (u: { label: string; run: () => void } | null) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  setFolder: (id: number) => Promise<void>
  setLabel: (id: number) => Promise<void>
  setSmartView: (id: number) => Promise<void>
  setUnified: () => Promise<void>
  select: (id: number) => Promise<void>
  toggleSelected: (id: number) => void
  clearSelected: () => void
  selectAll: (ids: number[]) => void
  sync: () => Promise<void>
  runSearch: (query: string) => Promise<void>
}

export const useMail = create<MailState>((set, get) => ({
  accounts: [],
  folders: [],
  labels: [],
  smartViews: [],
  messages: [],
  activeFolderId: null,
  activeLabelId: null,
  activeSmartViewId: null,
  activeUnified: false,
  selectedId: null,
  selected: null,
  selectedIds: new Set<number>(),
  syncing: false,
  searchQuery: '',
  sort: loadSort(),
  lastUndo: null,

  setSort: (s) => {
    try { localStorage.setItem('deskmail.sort', JSON.stringify(s)) } catch { /* ignore */ }
    set({ sort: s })
  },
  setUndo: (u) => set({ lastUndo: u }),

  init: async () => {
    await get().refresh()
    // Re-pull whenever the background sync updates the cache.
    window.deskmail.mail.onChanged(() => void get().refresh())
  },

  // Reload accounts/folders/labels/messages, preserving the active view + selection.
  refresh: async () => {
    const accounts = await window.deskmail.listAccounts()
    const folders = await window.deskmail.mail.listFolders()
    const labels = await window.deskmail.labels.list()
    const smartViews = await window.deskmail.smartViews.list()
    const labelId = get().activeLabelId
    const smartId = get().activeSmartViewId
    let active = get().activeFolderId
    let messages: MessageListItem[]
    if (get().activeUnified) {
      messages = await window.deskmail.mail.listUnified()
    } else if (smartId != null) {
      messages = await window.deskmail.smartViews.run(smartId)
    } else if (labelId != null) {
      messages = await window.deskmail.mail.listByLabel(labelId)
    } else {
      active = active ?? folders.find((f) => f.role === 'inbox')?.id ?? folders[0]?.id ?? null
      messages = active != null ? await window.deskmail.mail.listMessages(active) : []
    }
    set({ accounts, folders, labels, smartViews, messages, activeFolderId: active })

    // Refresh the open message if it's still around.
    const sel = get().selectedId
    if (sel != null) set({ selected: await window.deskmail.mail.getMessage(sel) })
  },

  setFolder: async (id) => {
    const messages = await window.deskmail.mail.listMessages(id)
    set({ activeFolderId: id, activeLabelId: null, activeSmartViewId: null, activeUnified: false, messages, selectedId: null, selected: null, selectedIds: new Set(), searchQuery: '' })
  },

  setLabel: async (id) => {
    const messages = await window.deskmail.mail.listByLabel(id)
    set({ activeLabelId: id, activeSmartViewId: null, activeUnified: false, messages, selectedId: null, selected: null, selectedIds: new Set(), searchQuery: '' })
  },

  setSmartView: async (id) => {
    const messages = await window.deskmail.smartViews.run(id)
    set({ activeSmartViewId: id, activeLabelId: null, activeUnified: false, messages, selectedId: null, selected: null, selectedIds: new Set(), searchQuery: '' })
  },

  setUnified: async () => {
    const messages = await window.deskmail.mail.listUnified()
    set({ activeUnified: true, activeFolderId: null, activeLabelId: null, activeSmartViewId: null, messages, selectedId: null, selected: null, selectedIds: new Set(), searchQuery: '' })
  },

  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),
  clearSelected: () => set({ selectedIds: new Set() }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),

  // Empty query returns to the active folder; otherwise show search results.
  runSearch: async (query) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      const fid = get().activeFolderId
      set({ messages: fid != null ? await window.deskmail.mail.listMessages(fid) : [] })
      return
    }
    set({ messages: await window.deskmail.mail.search(query) })
  },

  select: async (id) => {
    set({ selectedId: id })
    const selected = await window.deskmail.mail.getMessage(id)
    set({ selected })
    if (!selected || selected.isRead) return
    // Respect the "mark read" preference: immediately, after a delay, or never.
    const { markReadBehaviour: mode, markReadDelaySeconds: delay } = useLayout.getState().prefs
    if (mode === 'never') return
    const doMark = async (): Promise<void> => {
      await window.deskmail.mail.markRead(id, true)
      void get().refresh()
    }
    if (mode === 'delay') {
      // Only mark read if the message is still the selected one when the timer fires.
      setTimeout(() => { if (get().selectedId === id) void doMark() }, Math.max(0, delay) * 1000)
    } else {
      void doMark()
    }
  },

  sync: async () => {
    set({ syncing: true })
    try {
      await window.deskmail.mail.sync()
    } finally {
      set({ syncing: false })
    }
  }
}))
