import type { ReactNode } from 'react'

// A folder-style two-pane shell (list on the left, preview on the right) so the
// Drafts and Outbox views read like any other mail folder instead of a single
// centred column of cards. List/preview follow the app's default arrangement
// (list left, preview right); these views are simple enough that they don't yet
// honour a bottom/left reading-pane preference.
export function TwoPaneFolder({
  testId,
  title,
  count,
  loading,
  empty,
  rows,
  preview
}: {
  testId: string
  title: string
  count: number
  loading: boolean
  empty: ReactNode
  rows: ReactNode
  preview: ReactNode
}): JSX.Element {
  return (
    <div data-testid={testId} className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex h-12 flex-none items-center gap-2.5 border-b border-border px-3.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] font-semibold text-text-3">{count}</span>
      </div>
      {loading ? (
        <p className="px-2 py-6 text-center text-[13px] text-text-3">Loading…</p>
      ) : count === 0 ? (
        <div className="flex min-h-0 flex-1 items-start justify-center pt-12">{empty}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 w-[320px] flex-none flex-col overflow-y-auto overflow-x-hidden border-r-4 border-border">
            {rows}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">{preview}</div>
        </div>
      )}
    </div>
  )
}

// One row in the left list — mirrors the message-list row's selected-accent look.
export function PaneRow({
  selected,
  onClick,
  onDoubleClick,
  title,
  sub,
  icon,
  badge,
  danger
}: {
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  title: string
  sub: ReactNode
  icon?: ReactNode
  badge?: ReactNode
  danger?: boolean
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="flex cursor-pointer items-start gap-2.5 border-b border-border px-3.5 py-2.5 hover:bg-hover"
      style={{
        background: selected ? 'var(--accent-soft)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`
      }}
    >
      {icon && <span className="flex-none pt-0.5">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{title}</span>
          {badge}
        </div>
        <div className="truncate text-[12px]" style={{ color: danger ? 'var(--danger)' : 'var(--text-3)' }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

// Shared "nothing selected" placeholder for the preview side.
export function PanePlaceholder({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
      <div>
        <div className="text-[14px] font-bold text-text-2">Nothing selected</div>
        <p className="mx-auto mt-1 max-w-[280px] text-[12.5px] text-text-3">{text}</p>
      </div>
    </div>
  )
}
