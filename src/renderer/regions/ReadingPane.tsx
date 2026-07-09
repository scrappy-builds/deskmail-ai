import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import type { LabelInfo, MessageDetail, SnoozeOption } from '@shared/db'
import { fmtFullDate, initials } from '../mail/format'
import { buildReplyDraft, type ReplyKind } from '../mail/reply'
import { EmailBody } from '../mail/EmailBody'
import { InviteCard } from '../mail/InviteCard'
import { useMail } from '../store/mailStore'
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

// Move the open message into another folder. Reuses the existing 'move' action
// (local mutation + queued IMAP move), so it works offline and pushes on sync.
function MoveMenu({ messageId }: { messageId: number }): JSX.Element {
  const folders = useMail((s) => s.folders)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const showToast = useToast((s) => s.show)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Every folder except drafts and the one we're already in.
  const targets = folders.filter((f) => f.role !== 'drafts' && f.id !== activeFolderId)

  const move = (folderId: number, name: string): void => {
    void window.deskmail.mail.action(messageId, 'move', folderId)
    showToast(
      activeFolderId != null
        ? { text: `Moved to ${name}`, actionLabel: 'Undo', onAction: () => void window.deskmail.mail.action(messageId, 'move', activeFolderId) }
        : { text: `Moved to ${name}` }
    )
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Move to folder" className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-text-2 hover:bg-raised">
        <Icon name="filter" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-[300px] w-[200px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
          <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Move to…</div>
          {targets.length === 0 ? (
            <div className="px-2.5 py-1.5 text-[12px] text-text-3">No other folders.</div>
          ) : (
            targets.map((f) => (
              <button key={f.id} onClick={() => move(f.id, f.name)} className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                {f.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Applied-label chips + a menu to toggle labels on this message (and create new
// ones). Labels are colour tags, independent of the folder the message lives in.
function LabelBar({ messageId }: { messageId: number }): JSX.Element {
  const allLabels = useMail((s) => s.labels)
  const showToast = useToast((s) => s.show)
  const [applied, setApplied] = useState<LabelInfo[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const refresh = (): void => void window.deskmail.labels.forMessage(messageId).then(setApplied)
  useEffect(refresh, [messageId])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const appliedIds = new Set(applied.map((l) => l.id))
  const toggle = async (labelId: number, on: boolean): Promise<void> => {
    await window.deskmail.labels.toggle(messageId, labelId, on)
    refresh()
  }
  const createAndApply = async (): Promise<void> => {
    const name = creating.trim()
    setCreating('')
    if (!name) return
    try {
      const { id } = await window.deskmail.labels.create(name)
      await window.deskmail.labels.toggle(messageId, id, true)
      refresh()
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  return (
    <div ref={ref} className="relative mt-3 flex flex-wrap items-center gap-1.5">
      {applied.map((l) => (
        <span
          key={l.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: `color-mix(in srgb, ${l.colour ?? 'var(--accent)'} 18%, transparent)`, color: l.colour ?? 'var(--accent)' }}
        >
          {l.name}
          <button onClick={() => void toggle(l.id, false)} title="Remove label" className="opacity-70 hover:opacity-100">
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-2 px-2 py-0.5 text-[11px] font-semibold text-text-3 hover:border-accent hover:text-accent"
      >
        <Icon name="plus" size={11} /> Label
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-[260px] w-[200px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
          {allLabels.map((l) => {
            const on = appliedIds.has(l.id)
            return (
              <button key={l.id} onClick={() => void toggle(l.id, !on)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: l.colour ?? 'var(--accent)' }} />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                {on && <Icon name="check" size={14} className="text-accent" />}
              </button>
            )
          })}
          <input
            value={creating}
            onChange={(e) => setCreating(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createAndApply()
            }}
            placeholder="New label…"
            className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12.5px] outline-none focus:border-accent"
          />
        </div>
      )}
    </div>
  )
}

// One-line reply straight from the reading pane — no compose window. Sends via
// the same undo-window path, so it's still a deliberate, cancellable send.
function QuickReply({ m }: { m: MessageDetail }): JSX.Element | null {
  const accounts = useMail((s) => s.accounts)
  const showToast = useToast((s) => s.show)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!m.fromEmail) return null

  const send = async (): Promise<void> => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const selfEmail = accounts.find((a) => a.id === m.accountId)?.emailAddress
    const base = buildReplyDraft(m, 'reply', selfEmail)
    const escaped = body.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
    const payload = { ...base, bodyHtml: `<p>${escaped}</p>${base.bodyHtml}` }
    try {
      const { id } = await window.deskmail.compose.sendWithUndo(payload)
      setText('')
      showToast({ text: `Replying to ${m.fromName || m.fromEmail}…`, actionLabel: 'Undo', onAction: () => void window.deskmail.compose.cancelScheduled(id) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-none items-center gap-2 border-t border-border bg-panel px-3 py-2.5">
      <Icon name="reply" size={16} className="flex-none text-text-3" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
        placeholder={`Quick reply to ${m.fromName || m.fromEmail}…`}
        className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-[13px] outline-none focus:border-accent"
      />
      <button
        onClick={() => void send()}
        disabled={!text.trim() || busy}
        className="flex-none rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-fg hover:bg-accent-2 disabled:opacity-40"
      >
        Send
      </button>
    </div>
  )
}

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

function ToolBtn({ icon, title, onClick, active }: { icon: IconName; title: string; onClick?: () => void; active?: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-[34px] w-[34px] items-center justify-center rounded-md hover:bg-raised"
      style={{ color: active ? 'var(--star)' : 'var(--text-2)' }}
    >
      <Icon name={icon} size={18} fill={active && icon === 'star'} />
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
  const folders = useMail((s) => s.folders)
  const accounts = useMail((s) => s.accounts)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const refresh = useMail((s) => s.refresh)
  const showToast = useToast((s) => s.show)

  const inJunk = folders.find((f) => f.id === activeFolderId)?.role === 'junk'
  const inboxId = folders.find((f) => f.role === 'inbox')?.id

  // Archive/delete/move take the message out of the current folder — offer Undo
  // (move it back) via the toast. Reuses the queued move action.
  const actWithUndo = (op: 'archive' | 'trash', toast: string): void => {
    if (!m) return
    const mid = m.id
    const src = activeFolderId
    void window.deskmail.mail.action(mid, op)
    showToast(
      src != null
        ? { text: toast, actionLabel: 'Undo', onAction: () => void window.deskmail.mail.action(mid, 'move', src) }
        : { text: toast }
    )
  }

  const act = (op: Parameters<typeof window.deskmail.mail.action>[1], toast: string): void => {
    if (!m) return
    void window.deskmail.mail.action(m.id, op)
    showToast({ text: toast })
  }

  // Create a rule from this message: future mail from this sender → this folder.
  const createRuleFromSender = (): void => {
    if (!m?.fromEmail) return
    const folder = folders.find((f) => f.id === activeFolderId)
    if (!folder) {
      showToast({ text: 'Open the message from a folder to base a rule on it.' })
      return
    }
    void window.deskmail.rules
      .create({
        name: `From ${m.fromEmail} → ${folder.name}`,
        enabled: true,
        field: 'from',
        op: 'contains',
        value: m.fromEmail,
        action: 'move',
        targetFolderId: folder.id,
        targetLabelId: null
      })
      .then(() => showToast({ text: `Rule added: mail from ${m.fromEmail} → ${folder.name}. Tune it in Settings → Rules.` }))
  }

  // Reply/Reply-all/Forward: build a prefilled draft, then open compose on it.
  const startReply = (kind: ReplyKind): void => {
    if (!m) return
    const selfEmail = accounts.find((a) => a.id === m.accountId)?.emailAddress
    const payload = buildReplyDraft(m, kind, selfEmail)
    void window.deskmail.compose.saveDraft(payload).then(({ id }) => window.deskmail.openCompose(id))
  }

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
        <ToolBtn icon="reply" title="Reply" onClick={() => startReply('reply')} />
        <ToolBtn icon="replyAll" title="Reply all" onClick={() => startReply('replyAll')} />
        <ToolBtn icon="forward" title="Forward" onClick={() => startReply('forward')} />
        <div className="mx-1.5 h-5 w-px bg-border" />
        <ToolBtn icon="archive" title="Archive" onClick={() => actWithUndo('archive', 'Archived')} />
        <ToolBtn icon="trash" title="Delete" onClick={() => actWithUndo('trash', 'Moved to Bin')} />
        <ToolBtn icon="star" title={m.isStarred ? 'Unstar' : 'Star'} active={m.isStarred} onClick={() => act(m.isStarred ? 'unflag' : 'flag', m.isStarred ? 'Unstarred' : 'Starred')} />
        <ToolBtn
          icon="markUnread"
          title={m.isRead ? 'Mark unread' : 'Mark read'}
          onClick={() => {
            const toRead = !m.isRead
            void window.deskmail.mail.markRead(m.id, toRead).then(() => refresh())
            showToast({ text: toRead ? 'Marked read' : 'Marked unread' })
          }}
        />
        <ToolBtn
          icon="pin"
          title={m.isPinned ? 'Unpin' : 'Pin to top'}
          active={m.isPinned}
          onClick={() => {
            void window.deskmail.mail.pin(m.id, !m.isPinned)
            showToast({ text: m.isPinned ? 'Unpinned' : 'Pinned to top' })
          }}
        />
        <ToolBtn
          icon="mute"
          title={m.isMuted ? 'Unmute' : 'Mute'}
          onClick={() => {
            void window.deskmail.mail.mute(m.id, !m.isMuted)
            showToast({ text: m.isMuted ? 'Unmuted' : 'Muted — kept out of unread & Today' })
          }}
        />
        <ToolBtn
          icon="print"
          title="Print to PDF"
          onClick={() => {
            void window.deskmail.mail.printPdf(m.id).then((r) => {
              if (r.path) showToast({ text: 'Saved as PDF' })
            })
          }}
        />
        <ToolBtn icon="sliders" title="Create rule from sender" onClick={createRuleFromSender} />
        <MoveMenu messageId={m.id} />
        <SnoozeMenu messageId={m.id} />
        {inJunk && inboxId != null && (
          <button
            onClick={() => {
              void window.deskmail.mail.action(m.id, 'move', inboxId)
              showToast({ text: 'Moved to Inbox' })
            }}
            className="ml-1 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised"
          >
            Not junk
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onOpen?.(m.id)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          <Icon name="openWindow" size={15} /> Open in window
        </button>
        <button
          onClick={() => {
            void window.deskmail.notebooklm.export(m.id, m.attachments.length > 0).then((r) => {
              showToast({ text: r.note ? `Exported email to NotebookLM folder (${r.note})` : `Exported ${r.files.length} file(s) for NotebookLM` })
            })
          }}
          title="Export this email (and attachments) for NotebookLM"
          className="ml-2 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          <Icon name="draft" size={15} /> NotebookLM
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
          <LabelBar messageId={m.id} />
        </div>

        {m.invite && <InviteCard messageId={m.id} invite={m.invite} />}

        <EmailBody html={m.bodyHtml} text={m.bodyText} allowByDefault={!inJunk} messageId={m.id} />

        {m.attachments.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">
              Attachments ({m.attachments.length})
            </div>
            <div className="flex flex-wrap gap-2.5">
              {m.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => {
                    void window.deskmail.attachments.open(m.id, att.id).then((r) => {
                      if (!r.ok) showToast({ text: r.error ?? "Couldn't open the attachment" })
                    })
                  }}
                  title="Open attachment"
                  className="flex items-center gap-2.5 rounded-md border border-border bg-bg px-3 py-2 text-left hover:bg-hover"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent text-[8px] font-extrabold uppercase text-white">
                    {(att.filename?.split('.').pop() ?? 'file').slice(0, 4)}
                  </div>
                  <div className="min-w-0">
                    <div className="max-w-[180px] truncate text-[12.5px] font-semibold">{att.filename ?? 'attachment'}</div>
                    <div className="text-[10.5px] text-text-3">{fmtSize(att.size)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <QuickReply key={m.id} m={m} />
    </div>
  )
}
