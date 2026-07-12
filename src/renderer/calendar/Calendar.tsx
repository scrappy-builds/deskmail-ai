import { useEffect } from 'react'
import { Icon } from '../Icon'
import { PROVIDERS } from '@shared/meetings'
import type { EventSummary } from '@shared/db'
import { useCalendar, startOfWeek, type CalView } from '../store/calendarStore'
import { EventModal } from './EventModal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function isoOf(d: Date): string {
  return iso(d.getFullYear(), d.getMonth(), d.getDate())
}
function todayIso(): string {
  return isoOf(new Date())
}

interface Cell {
  date: string | null
  day: number
  inMonth: boolean
}
function buildCells(month: Date): Cell[] {
  const year = month.getFullYear()
  const mon = month.getMonth()
  const startWeekday = (new Date(year, mon, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startWeekday + 1
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth
    cells.push({ date: inMonth ? iso(year, mon, dayNum) : null, day: dayNum, inMonth })
  }
  return cells
}

function EventChip({ e, onClick }: { e: EventSummary; onClick?: () => void }): JSX.Element {
  return (
    <div
      onClick={(ev) => {
        ev.stopPropagation()
        onClick?.()
      }}
      className="truncate cursor-pointer rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
      style={{ background: PROVIDERS[e.provider].colour }}
      title={e.title}
    >
      {e.start ? `${e.start} ` : ''}
      {e.title}
    </div>
  )
}

export function Calendar(): JSX.Element {
  const { cursor, view, events, newEventOpen, editingEvent, load, prev, next, goToday, setView, goToDate, openNew, openEdit } = useCalendar()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byDate = new Map<string, EventSummary[]>()
  for (const e of events) {
    const arr = byDate.get(e.date) ?? []
    arr.push(e)
    byDate.set(e.date, arr)
  }
  const today = todayIso()
  const upcoming = [...events].sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? ''))).slice(0, 6)

  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const title =
    view === 'month'
      ? cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : view === 'day'
        ? cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* sidebar */}
      <div className="flex w-[252px] flex-none flex-col border-r border-border bg-panel">
        <div className="p-3.5 pb-2.5">
          <button onClick={() => openNew()} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-[13px] font-bold text-accent-fg hover:bg-accent-2">
            <Icon name="plus" size={16} /> New entry
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3.5">
          <div className="px-1 pb-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">Upcoming</div>
          {upcoming.length === 0 ? (
            <p className="px-1 text-[12px] text-text-3">Nothing scheduled in this range.</p>
          ) : (
            upcoming.map((e) => (
              <div key={`${e.id}-${e.date}`} className="flex gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-raised">
                <span className="w-1 flex-none rounded" style={{ background: PROVIDERS[e.provider].colour }} />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold">{e.title}</div>
                  <div className="text-[11px] text-text-3">
                    {new Date(e.date + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {e.start ? ` · ${e.start}` : ''}
                    {e.recurFreq !== 'none' ? ' · repeats' : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
        <div className="flex h-[52px] flex-none items-center gap-3 border-b border-border px-5">
          <span className="text-[17px] font-bold">{title}</span>
          <div className="flex gap-0.5">
            <button onClick={() => void prev()} className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Previous" aria-label="Previous">
              <Icon name="chevronDown" size={18} className="rotate-90" />
            </button>
            <button onClick={() => void next()} className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Next" aria-label="Next">
              <Icon name="chevronDown" size={18} className="-rotate-90" />
            </button>
          </div>
          <button onClick={() => void goToday()} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-raised">Today</button>
          <div className="flex-1" />
          <div className="flex gap-1 rounded-md border border-border bg-inset p-[3px]">
            {(['month', 'week', 'day'] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => void setView(v)}
                className="rounded-sm px-3 py-1 text-[12px] font-semibold capitalize"
                style={v === view ? { color: 'var(--accent-fg)', background: 'var(--accent)' } : { color: 'var(--text-2)' }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' && (
          <>
            <div className="grid flex-none grid-cols-7 border-b border-border">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.5px] text-text-3">{w}</div>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-y-auto bg-border" style={{ gridAutoRows: 'minmax(98px, 1fr)' }}>
              {buildCells(cursor).map((c, i) => {
                const evs = c.date ? byDate.get(c.date) ?? [] : []
                return (
                  <div key={i} onClick={() => c.date && void goToDate(c.date)} className="flex min-h-0 cursor-pointer flex-col gap-[3px] p-1.5 hover:bg-raised" style={{ background: c.inMonth ? 'var(--bg-2)' : 'var(--bg-3)' }}>
                    <div className="flex justify-end">
                      <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-pill px-1.5 text-[12px] font-bold" style={{ color: c.date === today ? 'var(--accent-fg)' : c.inMonth ? 'var(--text)' : 'var(--text-3)', background: c.date === today ? 'var(--accent)' : 'transparent' }}>
                        {c.inMonth ? c.day : ''}
                      </span>
                    </div>
                    {evs.slice(0, 3).map((e) => <EventChip key={`${e.id}-${e.date}`} e={e} onClick={() => openEdit(e)} />)}
                    {evs.length > 3 && <div className="px-1 text-[10.5px] text-text-3">+{evs.length - 3} more</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === 'week' && (
          <div className="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-y-auto bg-border">
            {weekDays.map((d) => {
              const key = isoOf(d)
              const evs = byDate.get(key) ?? []
              return (
                <div key={key} onClick={() => void goToDate(key)} className="flex min-h-0 cursor-pointer flex-col gap-[3px] bg-bg-2 p-2 hover:bg-raised">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-[.4px] text-text-3">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                    <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-pill px-1 text-[12px] font-bold" style={{ color: key === today ? 'var(--accent-fg)' : 'var(--text)', background: key === today ? 'var(--accent)' : 'transparent' }}>
                      {d.getDate()}
                    </span>
                  </div>
                  {evs.map((e) => <EventChip key={`${e.id}-${e.date}`} e={e} onClick={() => openEdit(e)} />)}
                </div>
              )
            })}
          </div>
        )}

        {view === 'day' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mx-auto max-w-[640px]">
              {(byDate.get(isoOf(cursor)) ?? []).length === 0 ? (
                <button onClick={() => openNew(isoOf(cursor))} className="w-full rounded-lg border border-dashed border-border-2 px-4 py-10 text-center text-[13px] text-text-3 hover:border-accent">
                  Nothing scheduled. Click to add an event.
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {(byDate.get(isoOf(cursor)) ?? []).map((e) => (
                    <div key={`${e.id}-${e.date}`} onClick={() => openEdit(e)} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 hover:border-accent">
                      <span className="w-1 self-stretch rounded" style={{ background: PROVIDERS[e.provider].colour }} />
                      <div className="w-[92px] flex-none text-[13px] font-bold">{e.start ?? 'All day'}{e.end ? `–${e.end}` : ''}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{e.title}</div>
                        <div className="text-[11.5px] text-text-3">{PROVIDERS[e.provider].label}{e.recurFreq !== 'none' ? ' · repeats' : ''}</div>
                      </div>
                      {e.joinUrl && (
                        <button onClick={(ev) => { ev.stopPropagation(); void window.deskmail.calendar.join(e.id) }} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg hover:bg-accent-2">Join</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(newEventOpen || editingEvent) && <EventModal />}
    </div>
  )
}
