import { useState } from 'react'
import type { LayoutPreferences } from '@shared/layout'
import type { CustomTheme } from '@shared/theme'
import { Icon } from './Icon'
import { MailActions } from './regions/MailActions'
import { useLayout } from './store/layoutStore'
import { useMail } from './store/mailStore'

export type Mode = 'mail' | 'calendar'

interface CommandBarProps {
  mode: Mode
  onMode: (m: Mode) => void
  onOpenViewSettings: () => void
  onCompose: () => void
}

// Reads the active colour scheme and offers the Light · Dark · custom picks.
// `base` resolves a custom theme down to its light/dark base, so the inline
// button keeps showing that base's sun/moon symbol.
function useThemeControls(): {
  prefs: LayoutPreferences
  active: CustomTheme | null
  base: 'light' | 'dark'
  pick: (id: string | null, theme?: 'light' | 'dark') => void
} {
  const prefs = useLayout((s) => s.prefs)
  const setPref = useLayout((s) => s.setPref)
  const active = prefs.customThemes.find((t) => t.id === prefs.activeThemeId) ?? null
  const base = active ? active.base : prefs.theme
  const pick = (id: string | null, theme?: 'light' | 'dark'): void => {
    if (theme) setPref('theme', theme)
    setPref('activeThemeId', id)
  }
  return { prefs, active, base, pick }
}

function themeItem(selected: boolean, text: string, onClick: () => void): JSX.Element {
  return (
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
}

// The list of scheme choices used by the inline menu.
function ThemeChoices({ onDone }: { onDone: () => void }): JSX.Element {
  const { prefs, active, pick } = useThemeControls()
  const choose = (id: string | null, theme?: 'light' | 'dark'): void => {
    pick(id, theme)
    onDone()
  }
  return (
    <>
      {themeItem(!active && prefs.theme === 'light', 'Light', () => choose(null, 'light'))}
      {themeItem(!active && prefs.theme === 'dark', 'Dark', () => choose(null, 'dark'))}
      {prefs.customThemes.length > 0 && <div className="my-1 h-px bg-border" />}
      {prefs.customThemes.map((t) => themeItem(t.id === prefs.activeThemeId, t.name, () => choose(t.id)))}
    </>
  )
}

// The old light/dark toggle, grown into a small scheme menu: Light · Dark ·
// your custom themes. Icon-only — the sun/moon symbol reflects the active base.
// Always visible (never folded); it's one of the fixed right-hand controls.
function ThemeMenu(): JSX.Element {
  const { base } = useThemeControls()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-text-2 hover:bg-raised"
        title="Colour scheme"
        aria-label="Colour scheme"
      >
        <Icon name={base === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[42px] z-[71] w-[180px] rounded-md border border-border bg-panel p-1 shadow-raised">
            <ThemeChoices onDone={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}

export function CommandBar({ mode, onMode, onCompose }: CommandBarProps): JSX.Element {
  const searchQuery = useMail((s) => s.searchQuery)
  const runSearch = useMail((s) => s.runSearch)
  const syncing = useMail((s) => s.syncing)
  const sync = useMail((s) => s.sync)

  const tab = (m: Mode, label: string, icon: 'mail' | 'calendar'): JSX.Element => {
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
        className="flex flex-none items-center gap-2 rounded-md bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
      >
        <Icon name={mode === 'calendar' ? 'calendar' : 'compose'} size={16} />
        <span>{mode === 'calendar' ? 'New entry' : 'Compose'}</span>
      </button>

      <div className="flex flex-none gap-0.5 rounded-md border border-border bg-inset p-[3px]">
        {tab('mail', 'Mail', 'mail')}
        {tab('calendar', 'Calendar', 'calendar')}
      </div>

      {/* Message actions (Mail mode) take the middle, flex-1 space and fold their
          own trailing buttons into "More" as the bar narrows. In Calendar mode a
          plain spacer keeps the right-hand controls pinned right. */}
      {mode === 'mail' ? (
        <>
          <div className="mx-1 h-6 w-px flex-none bg-border" />
          <MailActions />
        </>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      {/* --- Fixed right-hand controls: always visible, never folded. --- */}
      {/* Search box; widens on focus. */}
      <div className="flex w-[210px] flex-none items-center transition-[width] duration-200 focus-within:w-[340px]">
        <div className="relative flex w-full items-center">
          <span className="pointer-events-none absolute left-3 flex text-text-3">
            <Icon name="search" size={16} />
          </span>
          <input
            id="deskmail-search"
            placeholder={mode === 'mail' ? 'Search mail…' : 'Search events…'}
            title={mode === 'mail' ? 'Search tips: from: subject: body: has:attachment is:unread before:YYYY-MM-DD after:YYYY-MM-DD' : undefined}
            value={mode === 'mail' ? searchQuery : ''}
            onChange={(e) => mode === 'mail' && void runSearch(e.target.value)}
            disabled={mode !== 'mail'}
            className="h-[38px] w-full rounded-md border border-border bg-bg pl-10 pr-3 text-[13.5px] text-text outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Send / Receive — always static. */}
      <button
        onClick={() => void sync()}
        disabled={syncing}
        className="flex flex-none items-center gap-2 whitespace-nowrap rounded-md border border-border px-3 py-[9px] text-[13px] font-semibold text-text-2 hover:bg-raised disabled:opacity-50"
        title="Send queued mail and check for new mail"
      >
        <Icon name="sync" size={16} className={syncing ? 'animate-spin' : undefined} />
        <span>{syncing ? 'Syncing…' : 'Send / Receive'}</span>
      </button>

      {/* Colour scheme — always static. */}
      <ThemeMenu />
    </div>
  )
}
