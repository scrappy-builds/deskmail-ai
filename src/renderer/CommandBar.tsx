import { useState } from 'react'
import { Icon } from './Icon'
import { MailActions } from './regions/MailActions'
import { useLayout } from './store/layoutStore'
import { useMail } from './store/mailStore'

export type Mode = 'mail' | 'calendar' | 'today'

interface CommandBarProps {
  mode: Mode
  onMode: (m: Mode) => void
  onOpenViewSettings: () => void
  onCompose: () => void
}

// The old light/dark toggle, grown into a small scheme menu: Light · Dark ·
// your custom themes. With no custom themes it still behaves as a two-way pick.
function ThemeMenu(): JSX.Element {
  const prefs = useLayout((s) => s.prefs)
  const setPref = useLayout((s) => s.setPref)
  const [open, setOpen] = useState(false)

  const active = prefs.customThemes.find((t) => t.id === prefs.activeThemeId) ?? null
  const base = active ? active.base : prefs.theme
  const label = active ? active.name : base === 'dark' ? 'Dark' : 'Light'

  const pick = (id: string | null, theme?: 'light' | 'dark'): void => {
    if (theme) setPref('theme', theme)
    setPref('activeThemeId', id)
    setOpen(false)
  }
  const item = (selected: boolean, text: string, onClick: () => void): JSX.Element => (
    <button
      key={text}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-semibold hover:bg-hover"
      style={selected ? { color: 'var(--accent)' } : { color: 'var(--text-2)' }}
    >
      <span className="w-3.5 flex-none">{selected && <Icon name="check" size={13} />}</span>
      <span className="truncate">{text}</span>
    </button>
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-semibold text-text-2 hover:bg-raised"
        title="Colour scheme"
        aria-label="Colour scheme"
      >
        <Icon name={base === 'dark' ? 'sun' : 'moon'} size={16} />
        <span className="max-w-[110px] truncate">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[42px] z-[71] w-[180px] rounded-md border border-border bg-panel p-1 shadow-raised">
            {item(!active && prefs.theme === 'light', 'Light', () => pick(null, 'light'))}
            {item(!active && prefs.theme === 'dark', 'Dark', () => pick(null, 'dark'))}
            {prefs.customThemes.length > 0 && <div className="my-1 h-px bg-border" />}
            {prefs.customThemes.map((t) => item(t.id === prefs.activeThemeId, t.name, () => pick(t.id)))}
          </div>
        </>
      )}
    </div>
  )
}

export function CommandBar({ mode, onMode, onOpenViewSettings, onCompose }: CommandBarProps): JSX.Element {
  const searchQuery = useMail((s) => s.searchQuery)
  const runSearch = useMail((s) => s.runSearch)
  const syncing = useMail((s) => s.syncing)
  const sync = useMail((s) => s.sync)

  const tab = (m: Mode, label: string, icon: 'mail' | 'calendar' | 'clock'): JSX.Element => {
    const active = mode === m
    return (
      <button
        onClick={() => onMode(m)}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
        style={active ? { color: 'var(--accent-fg)', background: 'var(--accent)' } : { color: 'var(--text-2)' }}
      >
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div className="flex h-[56px] flex-none items-center gap-2.5 border-b border-border bg-panel px-3.5">
      {/* Compose sits top-left, Outlook-style. */}
      <button
        onClick={onCompose}
        className="flex items-center gap-2 rounded-md bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
      >
        <Icon name={mode === 'calendar' ? 'calendar' : 'compose'} size={16} />
        <span>{mode === 'calendar' ? 'New event' : 'Compose'}</span>
      </button>

      <div className="flex flex-none gap-0.5 rounded-md border border-border bg-inset p-[3px]">
        {tab('today', 'Today', 'clock')}
        {tab('mail', 'Mail', 'mail')}
        {tab('calendar', 'Calendar', 'calendar')}
      </div>

      {/* Message actions live in this same bar (Mail mode only), acting on the
          ticked messages or the one open in the reading pane. */}
      {mode === 'mail' && (
        <>
          <div className="mx-1 h-6 w-px flex-none bg-border" />
          <MailActions />
        </>
      )}

      <div className="min-w-0 flex-1" />

      {/* Compact search, kept on the right; grows when focused (no separate box). */}
      <div className="relative flex w-[210px] items-center transition-[width] duration-200 focus-within:w-[380px]">
        <span className="pointer-events-none absolute left-3 flex text-text-3">
          <Icon name="search" size={16} />
        </span>
        <input
          id="deskmail-search"
          placeholder={mode === 'mail' ? 'Search mail…' : 'Search events…'}
          value={mode === 'mail' ? searchQuery : ''}
          onChange={(e) => mode === 'mail' && void runSearch(e.target.value)}
          disabled={mode !== 'mail'}
          className="h-[38px] w-full rounded-md border border-border bg-bg pl-10 pr-3 text-[13.5px] text-text outline-none focus:border-accent"
        />
      </div>

      <button
        onClick={() => void sync()}
        disabled={syncing}
        className="flex items-center gap-2 rounded-md border border-border px-3 py-[9px] text-[13px] font-semibold text-text-2 hover:bg-raised disabled:opacity-50"
        title="Send queued mail and check for new mail"
      >
        <Icon name="sync" size={16} className={syncing ? 'animate-spin' : undefined} />
        <span>{syncing ? 'Syncing…' : 'Send / Receive'}</span>
      </button>

      <button
        onClick={onOpenViewSettings}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-text-2 hover:bg-raised"
        title="View settings"
      >
        <Icon name="sliders" size={18} />
      </button>

      <ThemeMenu />
    </div>
  )
}
