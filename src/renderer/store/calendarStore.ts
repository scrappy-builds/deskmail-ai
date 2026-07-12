import { create } from 'zustand'
import type { EventInput, EventSummary } from '@shared/db'

export type CalView = 'month' | 'week' | 'day'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Monday-based start of the week containing d.
export function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}
function rangeFor(view: CalView, cursor: Date): { from: string; to: string } {
  if (view === 'day') return { from: iso(cursor), to: iso(cursor) }
  if (view === 'week') {
    const s = startOfWeek(cursor)
    const e = new Date(s)
    e.setDate(e.getDate() + 6)
    return { from: iso(s), to: iso(e) }
  }
  return { from: iso(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), to: iso(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)) }
}

interface CalendarState {
  cursor: Date
  view: CalView
  events: EventSummary[]
  newEventOpen: boolean
  newEventDate: string | null
  editingEvent: EventSummary | null

  load: () => Promise<void>
  prev: () => Promise<void>
  next: () => Promise<void>
  goToday: () => Promise<void>
  setView: (v: CalView) => Promise<void>
  goToDate: (iso: string) => Promise<void>
  openNew: (date?: string) => void
  openEdit: (ev: EventSummary) => void
  closeNew: () => void
  createEvent: (input: EventInput) => Promise<void>
  updateEvent: (id: number, input: EventInput) => Promise<void>
  deleteEvent: (id: number) => Promise<void>
}

export const useCalendar = create<CalendarState>((set, get) => ({
  cursor: new Date(),
  view: 'month',
  events: [],
  newEventOpen: false,
  newEventDate: null,
  editingEvent: null,

  load: async () => {
    const { from, to } = rangeFor(get().view, get().cursor)
    set({ events: await window.deskmail.calendar.listEvents(from, to) })
  },

  prev: async () => {
    const { view, cursor } = get()
    const c = new Date(cursor)
    if (view === 'month') c.setMonth(c.getMonth() - 1)
    else if (view === 'week') c.setDate(c.getDate() - 7)
    else c.setDate(c.getDate() - 1)
    set({ cursor: c })
    await get().load()
  },
  next: async () => {
    const { view, cursor } = get()
    const c = new Date(cursor)
    if (view === 'month') c.setMonth(c.getMonth() + 1)
    else if (view === 'week') c.setDate(c.getDate() + 7)
    else c.setDate(c.getDate() + 1)
    set({ cursor: c })
    await get().load()
  },
  goToday: async () => {
    set({ cursor: new Date() })
    await get().load()
  },
  setView: async (v) => {
    set({ view: v })
    await get().load()
  },
  // Jump to a specific day and show it in day view (used by day-cell clicks).
  goToDate: async (isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number)
    set({ cursor: new Date(y, m - 1, d), view: 'day' })
    await get().load()
  },

  openNew: (date) => set({ newEventOpen: true, newEventDate: date ?? null, editingEvent: null }),
  openEdit: (ev) => set({ editingEvent: ev, newEventOpen: false, newEventDate: null }),
  closeNew: () => set({ newEventOpen: false, newEventDate: null, editingEvent: null }),

  createEvent: async (input) => {
    await window.deskmail.calendar.createEvent(input)
    set({ newEventOpen: false, newEventDate: null, editingEvent: null })
    await get().load()
  },
  updateEvent: async (id, input) => {
    await window.deskmail.calendar.updateEvent(id, input)
    set({ newEventOpen: false, newEventDate: null, editingEvent: null })
    await get().load()
  },
  deleteEvent: async (id) => {
    await window.deskmail.calendar.deleteEvent(id)
    set({ newEventOpen: false, newEventDate: null, editingEvent: null })
    await get().load()
  }
}))
