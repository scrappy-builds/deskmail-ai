import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import { PROVIDERS } from '@shared/meetings'
import type { TodayAgenda } from '@shared/db'
import { fmtTime, initials } from '../mail/format'

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

export function Today(): JSX.Element {
  const [agenda, setAgenda] = useState<TodayAgenda>({ events: [], messages: [] })
  const [cfg, setCfg] = useState<{ unread: boolean; starred: boolean }>({ unread: true, starred: false })

  const refresh = (): void => void window.deskmail.mail.today().then(setAgenda)
  useEffect(() => {
    refresh()
    void window.deskmail.mail.todayConfigGet().then(setCfg)
    return window.deskmail.mail.onChanged(refresh)
  }, [])

  const toggleCfg = (k: 'unread' | 'starred'): void => {
    const next = { ...cfg, [k]: !cfg[k] }
    setCfg(next)
    void window.deskmail.mail.todayConfigSet({ [k]: next[k] }).then(refresh)
  }

  const events = [...agenda.events].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[720px] px-8 py-8">
        <div className="text-[12px] font-bold uppercase tracking-[1px] text-accent">Today</div>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.5px]">{dateLabel}</h1>
        <p className="mt-1 text-[13.5px] text-text-2">Your events and the mail that still needs you, in one place.</p>

        {/* Events */}
        <div className="mt-7">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Today's events</div>
          {events.length === 0 ? (
            <p className="text-[13px] text-text-3">Nothing in the calendar today.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3">
                  <span className="w-1 self-stretch rounded" style={{ background: PROVIDERS[e.provider].colour }} />
                  <div className="w-[52px] flex-none text-[13px] font-bold">{e.start ?? '—'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{e.title}</div>
                    <div className="text-[11.5px] text-text-3">{PROVIDERS[e.provider].label}</div>
                  </div>
                  {e.joinUrl && (
                    <button onClick={() => void window.deskmail.calendar.join(e.id)} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg hover:bg-accent-2">
                      Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mail needing attention */}
        <div className="mt-7">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Needs your attention</span>
            <div className="flex-1" />
            {(['unread', 'starred'] as const).map((k) => (
              <button
                key={k}
                onClick={() => toggleCfg(k)}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                style={cfg[k] ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)' } : { borderColor: 'var(--border-2)', color: 'var(--text-3)' }}
              >
                {k}
              </button>
            ))}
          </div>
          {agenda.messages.length === 0 ? (
            <p className="text-[13px] text-text-3">You're all caught up. Nothing unread.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {agenda.messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => window.deskmail.openMessage(m.id)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-2.5 text-left hover:bg-hover"
                >
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[12px] font-bold" style={{ background: AVATAR.bg, color: AVATAR.fg }}>
                    {initials(m.fromName || m.fromEmail)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-[13px] font-bold">{m.fromName || m.fromEmail}</span>
                      <span className="flex-none text-[11px] text-text-3">{fmtTime(m.receivedAt)}</span>
                    </div>
                    <div className="truncate text-[12.5px] text-text-2">{m.subject || '(no subject)'}</div>
                  </div>
                  <Icon name="openWindow" size={14} className="flex-none text-text-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
