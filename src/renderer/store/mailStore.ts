import { create } from 'zustand'
import type { AccountSummary, FolderSummary, MessageDetail, MessageListItem } from '@shared/db'

// Mail data state — DB-backed via the IPC bridge. Reads come from the local
// SQLite cache, so the list and reading pane work offline. Kept separate from
// layout state by design.

interface MailState {
  accounts: AccountSummary[]
  folders: FolderSummary[]
  messages: MessageListItem[]
  activeFolderId: number | null
  selectedId: number | null
  selected: MessageDetail | null
  syncing: boolean
  searchQuery: string

  init: () => Promise<void>
  refresh: () => Promise<void>
  setFolder: (id: number) => Promise<void>
  select: (id: number) => Promise<void>
  sync: () => Promise<void>
  runSearch: (query: string) => Promise<void>
}

export const useMail = create<MailState>((set, get) => ({
  accounts: [],
  folders: [],
  messages: [],
  activeFolderId: null,
  selectedId: null,
  selected: null,
  syncing: false,
  searchQuery: '',

  init: async () => {
    await get().refresh()
    // Re-pull whenever the background sync updates the cache.
    window.deskmail.mail.onChanged(() => void get().refresh())
  },

  // Reload accounts/folders/messages, preserving the active folder + selection.
  refresh: async () => {
    const accounts = await window.deskmail.listAccounts()
    const folders = await window.deskmail.mail.listFolders()
    const active = get().activeFolderId ?? folders.find((f) => f.role === 'inbox')?.id ?? folders[0]?.id ?? null
    const messages = active != null ? await window.deskmail.mail.listMessages(active) : []
    set({ accounts, folders, messages, activeFolderId: active })

    // Refresh the open message if it's still around.
    const sel = get().selectedId
    if (sel != null) set({ selected: await window.deskmail.mail.getMessage(sel) })
  },

  setFolder: async (id) => {
    const messages = await window.deskmail.mail.listMessages(id)
    set({ activeFolderId: id, messages, selectedId: null, selected: null, searchQuery: '' })
  },

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
    if (selected && !selected.isRead) {
      await window.deskmail.mail.markRead(id, true)
      void get().refresh()
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
