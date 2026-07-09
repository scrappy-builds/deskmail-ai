import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import type { SnoozeOption } from '@shared/db'
import { fmtFullDate, initials } from '../mail/format'
import { EmailBody } from '../mail/EmailBody'
import { InviteCard } from '../mail/InviteCard'
import { useMail } from '../store/mailStore'
import { useLayout } from '../store/layoutStore'
import { useToast } from '../store/toastStore'

const SNOOZE_OPTS: { label: string; opt: SnoozeOption }[] = [
  { label: 'Later today', opt: 'later' },
  { label: 'Tomorrow', opt: 'tomorrow' },
  { label: 'This weekend', opt: 'weekend' },
  { label: 'Next week', opt: 'nextweek' }
]

function SnoozeMenu({ messageId }: { messageId: number }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const showToast = useToast((s) => s.show)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const snooze = (opt: SnoozeOption, label: string): void => {
    void window.deskmail.mail.snooze(messageId, opt)
    showToast({ text: `Snoozed until ${label.toLowerCase()}` })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Snooze" className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-text-2 hover:bg-raised">
        <Icon name="clock" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
          {SNOOZE_OPTS.map((s) => (
            <button key={s.opt} onClick={() => snooze(s.opt, s.label)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

function ToolBtn({ icon, title }: { icon: IconName; title: string }): JSX.Element {
  return (
    <button title={title} className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-text-2 hover:bg-raised">
      <Icon name={icon} size={18} />
    </button>
  )
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReadingPane({ onOpen }: { onOpen?: (id: number) => void }): JSX.Element {
  const m = useMail((s) => s.selected)
  const toggleClaude = useLayout((s) => s.toggleClaude)

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
      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-border bg-panel px-3 py-2">
        <ToolBtn icon="reply" title="Reply" />
        <ToolBtn icon="replyAll" title="Reply all" />
        <ToolBtn icon="forward" title="Forward" />
        <div className="mx-1.5 h-5 w-px bg-border" />
        <ToolBtn icon="archive" title="Archive" />
        <ToolBtn icon="trash" title="Delete" />
        <ToolBtn icon="star" title="Star" />
        <ToolBtn icon="markUnread" title="Mark unread" />
        <SnoozeMenu messageId={m.id} />
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
        <div className="border-b border-border px-6 py-5">
          <h1 className="text-[19px] font-bold leading-tight">{m.subject || '(no subject)'}</h1>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[14px] font-bold"
              style={{ background: AVATAR.bg, color: AVATAR.fg }}
            >
              {initials(m.fromName || m.fromEmail)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">
                {m.fromName || m.fromEmail}{' '}
                {m.fromEmail && <span className="font-normal text-text-3">&lt;{m.fromEmail}&gt;</span>}
              </div>
              <div className="truncate text-[12px] text-text-3">to {m.to.join(', ') || '—'}</div>
            </div>
            <div className="flex-none text-[12px] text-text-3">{fmtFullDate(m.receivedAt)}</div>
          </div>
        </div>

        {m.invite && <InviteCard messageId={m.id} invite={m.invite} />}

        <EmailBody html={m.bodyHtml} text={m.bodyText} />

        {m.attachments.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">
              Attachments ({m.attachments.length})
            </div>
            <div className="flex flex-wrap gap-2.5">
              {m.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2.5 rounded-md border border-border bg-bg px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent text-[8px] font-extrabold uppercase text-white">
                    {(att.filename?.split('.').pop() ?? 'file').slice(0, 4)}
                  </div>
                  <div className="min-w-0">
                    <div className="max-w-[180px] truncate text-[12.5px] font-semibold">{att.filename ?? 'attachment'}</div>
                    <div className="text-[10.5px] text-text-3">{fmtSize(att.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
