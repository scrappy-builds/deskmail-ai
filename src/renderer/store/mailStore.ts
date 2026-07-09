import { create } from 'zustand'

// Mail data / selection state — separate from layout state by design.
// Backed by mock data in Stage 2; swapped for the SQLite-backed store in Stage 5.

interface MailState {
  activeFolderId: string
  selectedId: number | null
  select: (id: number) => void
  setFolder: (id: string) => void
}

export const useMail = create<MailState>((set) => ({
  activeFolderId: 'inbox',
  selectedId: 1,
  select: (id) => set({ selectedId: id }),
  setFolder: (id) => set({ activeFolderId: id, selectedId: null })
}))
