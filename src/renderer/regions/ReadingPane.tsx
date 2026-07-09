import { Icon, type IconName } from '../Icon'
import { initials, messages } from '../mock/mailData'
import { useMail } from '../store/mailStore'
import { useLayout } from '../store/layoutStore'

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

function ToolBtn({ icon, title, danger }: { icon: IconName; title: string; danger?: boolean }): JSX.Element {
  return (
    <button
      title={title}
      className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-text-2 hover:bg-raised"
      style={danger ? { color: 'var(--text-2)' } : undefined}
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

export function ReadingPane({ onOpen }: { onOpen?: (id: number) => void }): JSX.Element {
  const selectedId = useMail((s) => s.selectedId)
  const toggleClaude = useLayout((s) => s.toggleClaude)
  const m = messages.find((x) => x.id === selectedId)

  if (!m) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-[320px]">
          <div className="text-[15px] font-bold text-text-2">Nothing selected</div>
          <p className="mt-1.5 text-[13px] text-text-3">
            Pick a message on the left to read it here. Double-click one to open it in its own window.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-border bg-panel px-3 py-2">
        <ToolBtn icon="reply" title="Reply" />
        <ToolBtn icon="replyAll" title="Reply all" />
        <ToolBtn icon="forward" title="Forward" />
        <div className="mx-1.5 h-5 w-px bg-border" />
        <ToolBtn icon="archive" title="Archive" />
        <ToolBtn icon="trash" title="Delete" danger />
        <ToolBtn icon="star" title="Star" />
        <ToolBtn icon="markUnread" title="Mark unread" />
        <div className="flex-1" />
        <button
          onClick={() => onOpen?.(m.id)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          <Icon name="openWindow" size={15} /> Open in window
        </button>
        <button
          onClick={toggleClaude}
          className="ml-2 flex items-center gap-1.5 rounded-md border border-claude px-2.5 py-1.5 text-[12.5px] font-semibold text-claude"
          style={{ background: 'var(--claude-soft)' }}
        >
          <Icon name="claude" size={15} /> Ask Claude
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* header */}
        <div className="border-b border-border px-6 py-5">
          <h1 className="text-[19px] font-bold leading-tight">{m.subject}</h1>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[14px] font-bold"
              style={{ background: AVATAR.bg, color: AVATAR.fg }}
            >
              {initials(m.fromName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">
                {m.fromName} <span className="font-normal text-text-3">&lt;{m.fromEmail}&gt;</span>
              </div>
              <div className="text-[12px] text-text-3">to {m.to}</div>
            </div>
            <div className="flex-none text-[12px] text-text-3">{m.time}</div>
          </div>
        </div>

        {/* remote-image block banner (real blocking lands in Stage 5) */}
        <div
          className="mx-6 mt-4 flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-[12.5px]"
          style={{ borderColor: 'var(--border-2)', background: 'var(--bg-3)', color: 'var(--text-2)' }}
        >
          <span className="flex-1">I've blocked remote images in this message to protect your privacy.</span>
          <button className="rounded-sm px-2.5 py-1 text-[12px] font-semibold text-accent hover:underline">
            Load images
          </button>
        </div>

        {/* body */}
        <div className="whitespace-pre-line px-6 py-5 text-[14px] leading-[1.65] text-text">{m.body}</div>

        {/* attachments (never auto-opened) */}
        {m.attach && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Attachments</div>
            <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-danger text-[8px] font-extrabold text-white">
                PDF
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold">INV-2041.pdf</div>
                <div className="text-[10.5px] text-text-3">148 KB</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
