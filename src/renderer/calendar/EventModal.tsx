import { useState } from 'react'
import { Icon } from '../Icon'
import type { EventInput, RecurFreq } from '@shared/db'
import { PROVIDERS, type MeetingProvider } from '@shared/meetings'
import { useCalendar } from '../store/calendarStore'
import { useToast } from '../store/toastStore'

const RECUR_LABELS: Record<RecurFreq, string> = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

// Only In person + Custom link for now — DeskMail doesn't create real
// Teams/Meet/Zoom meetings (that needs each provider's API; on the roadmap).
// Paste a real meeting link via Custom link. Links inside received invites still
// show a Join button.
const PROVIDER_ORDER: MeetingProvider[] = ['inperson', 'custom']

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EventModal(): JSX.Element {
  const { newEventDate, closeNew, createEvent, load } = useCalendar()
  const showToast = useToast((s) => s.show)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(newEventDate ?? todayIso())
  const [start, setStart] = useState('14:00')
  const [end, setEnd] = useState('14:30')
  const [provider, setProvider] = useState<MeetingProvider>('inperson')
  const [customLink, setCustomLink] = useState('')
  const [guests, setGuests] = useState('')
  const [notes, setNotes] = useState('')
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('none')
  const [recurUntil, setRecurUntil] = useState('')

  const info = PROVIDERS[provider]

  const buildInput = (): EventInput => ({
    title: title.trim(),
    date,
    start: start || null,
    end: end || null,
    provider,
    location: provider === 'custom' ? customLink.trim() || null : null,
    joinUrl: null,
    notes: notes.trim() || null,
    calendar: 'Personal',
    guests: guests.split(',').map((g) => g.trim()).filter(Boolean),
    recurFreq,
    recurUntil: recurFreq !== 'none' && recurUntil ? recurUntil : null
  })

  const save = (): void => {
    if (!title.trim()) return
    void createEvent(buildInput())
  }

  // Guests with an address can be emailed a real calendar invite. Explicit —
  // the button says it sends.
  const inviteableGuests = guests.split(',').map((g) => g.trim()).filter((g) => g.includes('@'))
  const saveAndInvite = async (): Promise<void> => {
    if (!title.trim()) return
    const { id } = await window.deskmail.calendar.createEvent(buildInput())
    const r = await window.deskmail.calendar.sendInvite(id)
    showToast({ text: r.ok ? `Invitation sent to ${inviteableGuests.join(', ')}` : `Saved, but the invite didn't send: ${r.error}` })
    closeNew()
    await load()
  }

  const label = 'text-[11px] font-bold uppercase tracking-[.5px] text-text-3'
  const box = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] text-text outline-none focus:border-accent'

  return (
    <div className="absolute inset-0 z-[66] flex items-center justify-center" style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }} onClick={closeNew}>
      <div className="flex max-h-[90vh] w-[min(560px,93vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center border-b border-border px-5 py-4">
          <span className="text-[16px] font-bold">New event</span>
          <div className="flex-1" />
          <button onClick={closeNew} className="flex rounded-md p-2 text-text-2 hover:bg-raised">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title"
            aria-label="Title"
            className="w-full border-none border-b-2 border-border bg-transparent px-0.5 pb-2 pt-1 text-[17px] font-semibold text-text outline-none focus:border-accent"
            style={{ borderBottom: '2px solid var(--border)' }}
          />

          <div className="flex gap-2.5">
            <label className="flex-1">
              <div className={`${label} mb-1.5`}>Date</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={box} aria-label="Date" />
            </label>
            <label className="flex-1">
              <div className={`${label} mb-1.5`}>Start</div>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={box} aria-label="Start" />
            </label>
            <label className="flex-1">
              <div className={`${label} mb-1.5`}>End</div>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={box} aria-label="End" />
            </label>
          </div>

          <div>
            <div className={`${label} mb-1.5`}>Meeting</div>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_ORDER.map((p) => {
                const active = p === provider
                const c = PROVIDERS[p]
                return (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] font-semibold"
                    style={{
                      borderColor: active ? c.colour : 'var(--border)',
                      color: active ? c.colour : 'var(--text-2)',
                      background: active ? `color-mix(in srgb, ${c.colour} 12%, transparent)` : 'transparent'
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.colour }} />
                    {c.label}
                  </button>
                )
              })}
            </div>
            {info.video && (
              <div className="mt-2.5 flex items-center gap-2 rounded-md px-3 py-2.5 text-[12px] leading-snug text-text-2" style={{ background: 'var(--accent-soft)' }}>
                <Icon name="openWindow" size={15} className="flex-none text-accent" />
                <span>I'll generate a {info.label} join link and open the app when you join (the browser link is the fallback).</span>
              </div>
            )}
            {provider === 'custom' && (
              <input value={customLink} onChange={(e) => setCustomLink(e.target.value)} placeholder="Paste meeting link (https://…)" aria-label="Custom link" className={`${box} mt-2.5`} />
            )}
          </div>

          <div className="flex gap-2.5">
            <label className="flex-1">
              <div className={`${label} mb-1.5`}>Repeat</div>
              <select value={recurFreq} onChange={(e) => setRecurFreq(e.target.value as RecurFreq)} className={box} aria-label="Repeat">
                {(Object.keys(RECUR_LABELS) as RecurFreq[]).map((f) => <option key={f} value={f}>{RECUR_LABELS[f]}</option>)}
              </select>
            </label>
            {recurFreq !== 'none' && (
              <label className="flex-1">
                <div className={`${label} mb-1.5`}>Until (optional)</div>
                <input type="date" value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} className={box} aria-label="Repeat until" />
              </label>
            )}
          </div>

          <label>
            <div className={`${label} mb-1.5`}>Guests</div>
            <input value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="Add guests, comma separated" aria-label="Guests" className={box} />
          </label>
          <label>
            <div className={`${label} mb-1.5`}>Notes</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, links, anything useful…" aria-label="Notes" className={`${box} min-h-[70px] resize-y leading-relaxed`} />
          </label>
        </div>

        <div className="flex flex-none justify-end gap-2.5 border-t border-border px-5 py-3.5">
          <button onClick={closeNew} className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">
            Cancel
          </button>
          {inviteableGuests.length > 0 && (
            <button
              onClick={() => void saveAndInvite()}
              disabled={!title.trim()}
              title={`Emails a calendar invitation to ${inviteableGuests.join(', ')}`}
              className="rounded-md border border-accent px-4 py-2 text-[13px] font-bold text-accent hover:bg-[var(--accent-soft)] disabled:opacity-40"
            >
              Save &amp; email invites
            </button>
          )}
          <button onClick={save} disabled={!title.trim()} className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-accent-fg hover:bg-accent-2 disabled:opacity-40">
            Save event
          </button>
        </div>
      </div>
    </div>
  )
}
