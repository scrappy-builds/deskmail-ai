import { Icon } from '../Icon'
import { useLayout } from '../store/layoutStore'
import type { ClaudeMode } from '@shared/layout'

const CHIPS = ['Summarise', 'Draft reply', 'Explain simply', 'Extract details', 'Extract dates', 'Find related', 'Turn into task']

function PanelContent({ onClose }: { onClose?: () => void }): JSX.Element {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel">
      {/* header */}
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3.5">
        <div
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md text-white"
          style={{ background: 'linear-gradient(135deg,var(--claude),color-mix(in srgb,var(--claude) 68%,#000))' }}
        >
          <Icon name="claude" size={16} fill />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">Claude</div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-3">
            <span className="block h-1.5 w-1.5 rounded-full bg-success" />
            MCP connected · read &amp; draft only
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex rounded-md p-1.5 text-text-2 hover:bg-raised" title="Close">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* transcript */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        <div className="flex gap-2.5">
          <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md bg-claude text-[11px] font-extrabold text-white">
            C
          </div>
          <div className="flex-1 rounded-[4px_12px_12px_12px] bg-raised px-3 py-2.5 text-[13px] leading-[1.55] text-text-2">
            Hi Jordan — I can search, read, summarise, and draft replies across your accounts. I can't send or
            delete anything; you approve those. What would you like to do?
          </div>
        </div>
      </div>

      {/* action chips */}
      <div className="flex flex-none flex-wrap gap-1.5 px-3.5 pt-3">
        {CHIPS.map((c) => (
          <span
            key={c}
            className="cursor-pointer rounded-pill border border-claude px-2.5 py-1 text-[11.5px] font-semibold text-claude"
            style={{ background: 'var(--claude-soft)' }}
          >
            {c}
          </span>
        ))}
      </div>

      {/* input */}
      <div className="flex-none px-3.5 pb-3.5 pt-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-bg py-2 pl-3 pr-2">
          <textarea
            rows={1}
            placeholder="Ask Claude about your mail…"
            className="max-h-[90px] flex-1 resize-none border-none bg-transparent py-1 text-[13px] leading-[1.5] text-text outline-none"
          />
          <button className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-claude text-white">
            <Icon name="send" size={15} />
          </button>
        </div>
        <div className="mt-2 text-center text-[10.5px] text-text-3">
          Claude can't send or delete — those need your approval.
        </div>
      </div>
    </div>
  )
}

// Positioned Claude panel. 'docked' is rendered inline by Workspace; the
// slide-over / float variants are overlays shown only when the user opens Claude.
export function ClaudePanel({ mode }: { mode: ClaudeMode }): JSX.Element | null {
  const claudeOpen = useLayout((s) => s.claudeOpen)
  const toggleClaude = useLayout((s) => s.toggleClaude)

  if (mode === 'hidden') return null

  if (mode === 'docked') {
    return (
      <div className="flex w-[360px] flex-none flex-col border-l border-border" style={{ order: 4 }}>
        <PanelContent />
      </div>
    )
  }

  if (!claudeOpen) return null

  if (mode === 'float') {
    return (
      <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-end p-4">
        <div className="pointer-events-auto h-[560px] max-h-full w-[380px] overflow-hidden rounded-lg border border-border-2 shadow-raised">
          <PanelContent onClose={toggleClaude} />
        </div>
      </div>
    )
  }

  // slide-right | slide-left
  const left = mode === 'slide-left'
  return (
    <div className="absolute inset-0 z-40 flex" style={{ justifyContent: left ? 'flex-start' : 'flex-end' }}>
      <div className="absolute inset-0 bg-black/20" onClick={toggleClaude} />
      <div
        className="relative h-full w-[380px] shadow-raised"
        style={{ borderLeft: left ? 'none' : '1px solid var(--border)', borderRight: left ? '1px solid var(--border)' : 'none' }}
      >
        <PanelContent onClose={toggleClaude} />
      </div>
    </div>
  )
}
