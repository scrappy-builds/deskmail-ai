import { create } from 'zustand'
import type { EventInput, EventSummary } from '@shared/db'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface CalendarState {
  month: Date // any date within the visible month (kept as the 1st)
  events: EventSummary[]
  newEventOpen: boolean
  newEventDate: string | null

  load: () => Promise<void>
  prevMonth: () => Promise<void>
  nextMonth: () => Promise<void>
  goToday: () => Promise<void>
  openNew: (date?: string) => void
  closeNew: () => void
  createEvent: (input: EventInput) => Promise<void>
}

function firstOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export const useCalendar = create<CalendarState>((set, get) => ({
  month: firstOf(new Date()),
  events: [],
  newEventOpen: false,
  newEventDate: null,

  load: async () => {
    const m = get().month
    const from = iso(new Date(m.getFullYear(), m.getMonth(), 1))
    const to = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0))
    set({ events: await window.deskmail.calendar.listEvents(from, to) })
  },

  prevMonth: async () => {
    const m = get().month
    set({ month: new Date(m.getFullYear(), m.getMonth() - 1, 1) })
    await get().load()
  },
  nextMonth: async () => {
    const m = get().month
    set({ month: new Date(m.getFullYear(), m.getMonth() + 1, 1) })
    await get().load()
  },
  goToday: async () => {
    set({ month: firstOf(new Date()) })
    await get().load()
  },

  openNew: (date) => set({ newEventOpen: true, newEventDate: date ?? null }),
  closeNew: () => set({ newEventOpen: false, newEventDate: null }),

  createEvent: async (input) => {
    await window.deskmail.calendar.createEvent(input)
    set({ newEventOpen: false, newEventDate: null })
    await get().load()
  }
}))
