import { Icon } from './Icon'
import { useLayout } from './store/layoutStore'
import { useMail } from './store/mailStore'

export type Mode = 'mail' | 'calendar' | 'today'

interface CommandBarProps {
  mode: Mode
  onMode: (m: Mode) => void
  onOpenViewSettings: () => void
  onCompose: () => void
}

export function CommandBar({ mode, onMode, onOpenViewSettings, onCompose }: CommandBarProps): JSX.Element {
  const theme = useLayout((s) => s.prefs.theme)
  const toggleTheme = useLayout((s) => s.toggleTheme)
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
      <div className="flex gap-0.5 rounded-md border border-border bg-inset p-[3px]">
        {tab('today', 'Today', 'clock')}
        {tab('mail', 'Mail', 'mail')}
        {tab('calendar', 'Calendar', 'calendar')}
      </div>

      <div className="relative flex max-w-[640px] flex-1 items-center">
        <span className="pointer-events-none absolute left-3 flex text-text-3">
          <Icon name="search" size={16} />
        </span>
        <input
          placeholder={mode === 'mail' ? 'Search mail…' : 'Search events…'}
          value={mode === 'mail' ? searchQuery : ''}
          onChange={(e) => mode === 'mail' && void runSearch(e.target.value)}
          disabled={mode !== 'mail'}
          className="h-[38px] w-full rounded-md border border-border bg-bg pl-10 pr-[90px] text-[13.5px] text-text outline-none focus:border-accent"
        />
        <span className="pointer-events-none absolute right-3 flex gap-1.5">
          <kbd className="rounded-sm border border-border bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-text-3">Ctrl</kbd>
          <kbd className="rounded-sm border border-border bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-text-3">K</kbd>
        </span>
      </div>

      <div className="flex-1" />

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
        onClick={onCompose}
        className="flex items-center gap-2 rounded-md bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
      >
        <Icon name={mode === 'calendar' ? 'calendar' : 'compose'} size={16} />
        <span>{mode === 'calendar' ? 'New event' : 'Compose'}</span>
      </button>

      <button
        onClick={onOpenViewSettings}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-text-2 hover:bg-raised"
        title="View settings"
      >
        <Icon name="sliders" size={18} />
      </button>

      <button
        onClick={toggleTheme}
        className="flex h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-semibold text-text-2 hover:bg-raised"
        title="Switch light / dark"
        aria-label="Toggle theme"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
  )
}
