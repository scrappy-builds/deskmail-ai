import { useEffect } from 'react'
import { Icon } from '../Icon'
import { PROVIDERS } from '@shared/meetings'
import type { EventSummary } from '@shared/db'
import { useCalendar } from '../store/calendarStore'
import { EventModal } from './EventModal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayIso(): string {
  const d = new Date()
  return iso(d.getFullYear(), d.getMonth(), d.getDate())
}

interface Cell {
  date: string | null
  day: number
  inMonth: boolean
}

function buildCells(month: Date): Cell[] {
  const year = month.getFullYear()
  const mon = month.getMonth()
  const startWeekday = (new Date(year, mon, 1).getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startWeekday + 1
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth
    cells.push({ date: inMonth ? iso(year, mon, dayNum) : null, day: dayNum, inMonth })
  }
  return cells
}

export function Calendar(): JSX.Element {
  const { month, events, newEventOpen, load, prevMonth, nextMonth, goToday, openNew } = useCalendar()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cells = buildCells(month)
  const byDate = new Map<string, EventSummary[]>()
  for (const e of events) {
    const arr = byDate.get(e.date) ?? []
    arr.push(e)
    byDate.set(e.date, arr)
  }
  const today = todayIso()
  const title = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const upcoming = [...events].sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? ''))).slice(0, 6)

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* sidebar */}
      <div className="flex w-[252px] flex-none flex-col border-r border-border bg-panel">
        <div className="p-3.5 pb-2.5">
          <button
            onClick={() => openNew()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-[13px] font-bold text-accent-fg hover:bg-accent-2"
          >
            <Icon name="plus" size={16} /> New event
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3.5">
          <div className="px-1 pb-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">Upcoming</div>
          {upcoming.length === 0 ? (
            <p className="px-1 text-[12px] text-text-3">Nothing scheduled this month.</p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="flex gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-raised">
                <span className="w-1 flex-none rounded" style={{ background: PROVIDERS[e.provider].colour }} />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold">{e.title}</div>
                  <div className="text-[11px] text-text-3">
                    {new Date(e.date + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {e.start ? ` · ${e.start}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* month */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
        <div className="flex h-[52px] flex-none items-center gap-3 border-b border-border px-5">
          <span className="text-[17px] font-bold">{title}</span>
          <div className="flex gap-0.5">
            <button onClick={() => void prevMonth()} className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Previous month" aria-label="Previous month">
              <Icon name="chevronDown" size={18} className="rotate-90" />
            </button>
            <button onClick={() => void nextMonth()} className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Next month" aria-label="Next month">
              <Icon name="chevronDown" size={18} className="-rotate-90" />
            </button>
          </div>
          <button onClick={() => void goToday()} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-raised">
            Today
          </button>
        </div>

        <div className="grid flex-none grid-cols-7 border-b border-border">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.5px] text-text-3">
              {w}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-y-auto bg-border" style={{ gridAutoRows: 'minmax(98px, 1fr)' }}>
          {cells.map((c, i) => {
            const evs = c.date ? byDate.get(c.date) ?? [] : []
            const isToday = c.date === today
            return (
              <div
                key={i}
                onClick={() => c.date && openNew(c.date)}
                className="flex min-h-0 cursor-pointer flex-col gap-[3px] p-1.5 hover:bg-raised"
                style={{ background: c.inMonth ? 'var(--bg-2)' : 'var(--bg-3)' }}
              >
                <div className="flex justify-end">
                  <span
                    className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-pill px-1.5 text-[12px] font-bold"
                    style={{
                      color: isToday ? 'var(--accent-fg)' : c.inMonth ? 'var(--text)' : 'var(--text-3)',
                      background: isToday ? 'var(--accent)' : 'transparent'
                    }}
                  >
                    {c.inMonth ? c.day : ''}
                  </span>
                </div>
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="truncate rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
                    style={{ background: PROVIDERS[e.provider].colour }}
                    title={e.title}
                  >
                    {e.start ? `${e.start} ` : ''}
                    {e.title}
                  </div>
                ))}
                {evs.length > 3 && <div className="px-1 text-[10.5px] text-text-3">+{evs.length - 3} more</div>}
              </div>
            )
          })}
        </div>
      </div>

      {newEventOpen && <EventModal />}
    </div>
  )
}
