import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import type { MessageDetail } from '@shared/db'
import { fmtFullDate, initials } from './mail/format'
import { EmailBody } from './mail/EmailBody'

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

const ACTIONS: { icon: IconName; label: string }[] = [
  { icon: 'reply', label: 'Reply' },
  { icon: 'replyAll', label: 'Reply all' },
  { icon: 'forward', label: 'Forward' },
  { icon: 'archive', label: 'Archive' },
  { icon: 'trash', label: 'Delete' },
  { icon: 'star', label: 'Star' },
  { icon: 'markUnread', label: 'Mark unread' },
  { icon: 'print', label: 'Print' }
]

const CLAUDE_ACTIONS = [
  'Summarise',
  'Draft reply',
  'Explain simply',
  'Extract key details',
  'Extract dates & deadlines',
  'Find related emails',
  'Turn into task'
]

export function MessageWindow({ id }: { id: number }): JSX.Element {
  const [m, setM] = useState<MessageDetail | null | 'loading'>('loading')
  const w = window.deskmail.window

  useEffect(() => {
    void window.deskmail.mail.getMessage(id).then(setM)
  }, [id])

  const chrome = (title: string): JSX.Element => (
    <div className="drag-region flex h-[38px] flex-none items-center border-b border-border bg-raised pl-3.5 pr-1.5">
      <span className="truncate text-[12.5px] font-semibold text-text-2">{title} — DeskMail AI</span>
      <div className="flex-1" />
      <div className="no-drag flex items-center gap-px">
        <button onClick={() => w.minimise()} className="flex h-[30px] w-[42px] items-center justify-center rounded-md text-text-2 hover:bg-hover" title="Minimise">
          <Icon name="minimise" size={16} />
        </button>
        <button onClick={() => w.toggleMaximise()} className="flex h-[30px] w-[42px] items-center justify-center rounded-md text-text-2 hover:bg-hover" title="Maximise">
          <Icon name="maximise" size={14} />
        </button>
        <button onClick={() => w.close()} className="flex h-[30px] w-[42px] items-center justify-center rounded-md text-text-2 hover:bg-danger hover:text-white" title="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  )

  if (m === 'loading') {
    return (
      <div className="flex h-screen flex-col bg-panel text-text">
        {chrome('Loading…')}
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-3">Loading message…</div>
      </div>
    )
  }

  if (!m) {
    return (
      <div className="flex h-screen flex-col bg-panel text-text">
        {chrome('Message not found')}
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-[320px]">
            <div className="text-[15px] font-bold text-text-2">I couldn't find that message</div>
            <p className="mt-1.5 text-[13px] text-text-3">
              It may have been moved or deleted. Close this window and pick it again from the list.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="message-window" data-message-id={m.id} className="flex h-screen flex-col overflow-hidden bg-panel text-text">
      {chrome(m.subject || '(no subject)')}

      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
        {ACTIONS.map((a) => (
          <button key={a.label} title={a.label} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
            <Icon name={a.icon} size={16} fill={a.icon === 'star'} />
            <span>{a.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => w.close()} title="Close" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
          <Icon name="close" size={16} />
          <span>Close</span>
        </button>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border px-3.5 py-2.5" style={{ background: 'var(--claude-soft)' }}>
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-claude">
          <Icon name="claude" size={15} fill /> Claude
        </span>
        {CLAUDE_ACTIONS.map((c) => (
          <span key={c} className="cursor-pointer rounded-pill border border-claude bg-panel px-2.5 py-1 text-[12px] font-semibold text-claude">
            {c}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-[720px]">
          <h1 className="mb-4 text-[22px] font-bold leading-tight">{m.subject || '(no subject)'}</h1>
          <div className="flex items-center gap-3.5 border-b border-border pb-[18px]">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[15px] font-bold" style={{ background: AVATAR.bg, color: AVATAR.fg }}>
              {initials(m.fromName || m.fromEmail)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold">
                {m.fromName || m.fromEmail}{' '}
                {m.fromEmail && <span className="text-[12.5px] font-normal text-text-3">&lt;{m.fromEmail}&gt;</span>}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-text-3">to {m.to.join(', ') || '—'}</div>
            </div>
            <div className="text-[12.5px] text-text-3">{fmtFullDate(m.receivedAt)}</div>
          </div>

          <div className="mt-[18px]">
            <EmailBody html={m.bodyHtml} text={m.bodyText} />
          </div>
        </div>
      </div>
    </div>
  )
}
