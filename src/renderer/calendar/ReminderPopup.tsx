import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { EventSummary } from '@shared/db'

// Snooze durations offered in the popup (minutes).
const SNOOZE_OPTS: { label: string; minutes: number }[] = [
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 }
]

// A friendly one-line "when" for the event: the date, plus the time if it has one.
function whenLabel(ev: EventSummary): string {
  const [y, m, d] = ev.date.split('-').map(Number)
  const date = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  if (!ev.start) return date
  return ev.end ? `${date} · ${ev.start}–${ev.end}` : `${date} · ${ev.start}`
}

export function ReminderPopup({ eventId }: { eventId: number }): JSX.Element {
  const [ev, setEv] = useState<EventSummary | null | 'loading'>('loading')
  const [snooze, setSnooze] = useState(10)
  const w = window.deskmail.window

  useEffect(() => {
    void window.deskmail.calendar.getEvent(eventId).then(setEv)
  }, [eventId])

  const chrome = (
    <div className="drag-region flex h-[34px] flex-none items-center border-b border-border bg-raised pl-3.5 pr-1.5">
      <Icon name="clock" size={14} className="text-accent" />
      <span className="ml-2 truncate text-[12px] font-semibold text-text-2">Reminder</span>
      <div className="flex-1" />
      <div className="no-drag flex items-center">
        <button onClick={() => w.close()} className="flex h-[26px] w-[38px] items-center justify-center rounded-md text-text-2 hover:bg-danger hover:text-white" title="Close">
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )

  if (ev === 'loading' || !ev) {
    return (
      <div className="flex h-screen flex-col bg-panel text-text">
        {chrome}
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-3">
          {ev === 'loading' ? 'Loading…' : 'That event no longer exists.'}
        </div>
      </div>
    )
  }

  const event = ev

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-panel text-text">
      {chrome}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Coming up</div>
        <h1 className="mt-1 text-[19px] font-bold leading-tight">{event.title}</h1>
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text-2">
          <Icon name="clock" size={14} className="flex-none opacity-80" />
          <span>{whenLabel(event)}</span>
        </div>
        {event.location && (
          <div className="mt-1 truncate text-[12.5px] text-text-3" title={event.location}>
            {event.location}
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-border px-5 py-3">
        <select
          value={snooze}
          onChange={(e) => setSnooze(Number(e.target.value))}
          className="rounded-md border border-border-2 bg-inset px-2 py-1.5 text-[12.5px] font-semibold text-text-2"
          title="Snooze for"
        >
          {SNOOZE_OPTS.map((s) => (
            <option key={s.minutes} value={s.minutes}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => void window.deskmail.reminders.snooze(event.id, snooze)}
          className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          Snooze
        </button>
        <div className="flex-1" />
        {event.joinUrl && (
          <button
            onClick={() => void window.deskmail.calendar.join(event.id)}
            className="rounded-md bg-[var(--accent-soft)] px-3 py-1.5 text-[12.5px] font-semibold text-accent hover:brightness-95"
          >
            Join
          </button>
        )}
        <button
          onClick={() => void window.deskmail.reminders.dismiss(event.id)}
          className="rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-95"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
