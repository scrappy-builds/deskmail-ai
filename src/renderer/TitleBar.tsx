import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useTheme } from './theme'

// Menu items are mostly placeholders in Stage 1 — the shell needs to look and
// behave right; real actions get wired as their features land in later stages.
type MenuItem = { label: string; kbd?: string; onClick?: () => void } | 'sep'

function useMenus(): {
  open: string | null
  toggle: (id: string) => void
  close: () => void
  rootRef: React.RefObject<HTMLDivElement>
} {
  const [open, setOpen] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return { open, toggle: (id) => setOpen((o) => (o === id ? null : id)), close: () => setOpen(null), rootRef }
}

function Dropdown({ items, onPick }: { items: MenuItem[]; onPick: () => void }): JSX.Element {
  return (
    <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="mx-2 my-1.5 h-px bg-border" />
        ) : (
          <button
            key={i}
            onClick={() => {
              it.onClick?.()
              onPick()
            }}
            className="flex w-full items-center gap-3.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent"
          >
            <span className="flex-1">{it.label}</span>
            {it.kbd && <span className="font-mono text-[10.5px] text-text-3">{it.kbd}</span>}
          </button>
        )
      )}
    </div>
  )
}

export function TitleBar(): JSX.Element {
  const { open, toggle, close, rootRef } = useMenus()
  const { toggle: toggleTheme } = useTheme()
  const w = window.deskmail.window

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'New email', kbd: 'Ctrl N' },
      { label: 'New event', kbd: 'Ctrl E' },
      'sep',
      { label: 'Settings…', kbd: 'Ctrl ,' },
      'sep',
      { label: 'Close window', kbd: 'Ctrl W', onClick: () => w.close() }
    ],
    View: [
      { label: 'Mail' },
      { label: 'Calendar' },
      'sep',
      { label: 'View settings…' },
      { label: 'Toggle light / dark', onClick: toggleTheme }
    ],
    Help: [{ label: 'Keyboard shortcuts' }, { label: 'About DeskMail AI' }]
  }

  const btn =
    'block cursor-pointer rounded-md px-2 py-[3px] text-[12.5px] hover:bg-raised'

  return (
    <div className="drag-region flex h-[38px] flex-none select-none items-center gap-1 border-b border-border bg-panel pl-3 pr-1.5">
      <div
        className="h-[18px] w-[18px] flex-none rounded-[5px]"
        style={{ background: 'linear-gradient(135deg,var(--accent),var(--claude))' }}
      />
      <span className="mr-3.5 text-[12.5px] font-bold tracking-[.2px]">
        DeskMail <span className="text-claude">AI</span>
      </span>

      <div ref={rootRef} className="no-drag flex gap-0.5 text-text-2">
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="relative">
            <span
              onClick={() => toggle(name)}
              className={btn}
              style={open === name ? { background: 'var(--bg-3)' } : undefined}
            >
              {name}
            </span>
            {open === name && <Dropdown items={items} onPick={close} />}
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-px">
        <button onClick={() => w.minimise()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Minimise">
          <Icon name="minimise" size={16} />
        </button>
        <button onClick={() => w.toggleMaximise()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Maximise">
          <Icon name="maximise" size={14} />
        </button>
        <button onClick={() => w.close()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-danger hover:text-white" title="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  )
}
