import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { LabelInfo, MessageDetail } from '@shared/db'
import { fmtFullDate, initials } from '../mail/format'
import { buildReplyDraft } from '../mail/reply'
import { parseListUnsubscribe } from '../mail/unsubscribe'
import { EmailBody } from '../mail/EmailBody'
import { InviteCard } from '../mail/InviteCard'
import { useMail } from '../store/mailStore'
import { useToast } from '../store/toastStore'

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
      const res = await window.deskmail.compose.sendWithUndo(payload)
      setText('')
      if (res.id == null) showToast({ text: res.ok ? 'Reply sent' : `Couldn't send: ${res.error ?? 'unknown error'}` })
      else {
        const id = res.id
        showToast({ text: `Replying to ${m.fromName || m.fromEmail}…`, actionLabel: 'Undo', onAction: () => void window.deskmail.compose.cancelScheduled(id) })
      }
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

// "Mailing list — Unsubscribe" line, driven by the stored List-Unsubscribe
// header. mailto → a compose window to review and send; https → the browser
// (after a confirm). Nothing ever fires without a click.
export function UnsubscribeLine({ m }: { m: MessageDetail }): JSX.Element | null {
  const opts = parseListUnsubscribe(m.listUnsubscribe)
  if (!opts) return null

  const unsubscribe = async (): Promise<void> => {
    if (opts.mailto) {
      const { id } = await window.deskmail.compose.saveDraft({
        accountId: m.accountId,
        to: [opts.mailto.to],
        cc: [],
        bcc: [],
        subject: opts.mailto.subject ?? 'unsubscribe',
        bodyHtml: '<p>Please unsubscribe me from this mailing list.</p>'
      })
      window.deskmail.openCompose(id)
      return
    }
    if (opts.url && window.confirm('This opens the unsubscribe page in your browser. Continue?')) {
      window.deskmail.openExternal(opts.url)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[12px] text-text-3">
      <Icon name="mail" size={12} className="flex-none" />
      Mailing list —
      <button onClick={() => void unsubscribe()} className="font-semibold text-accent hover:underline">
        Unsubscribe
      </button>
    </div>
  )
}

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReadingPane(): JSX.Element {
  const m = useMail((s) => s.selected)
  const folders = useMail((s) => s.folders)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const showToast = useToast((s) => s.show)

  // Message actions now live in the top command-bar ribbon; the pane just reads.
  const inJunk = folders.find((f) => f.id === activeFolderId)?.role === 'junk'

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
      <div key={m.id} className="dm-fade min-h-0 flex-1 overflow-y-auto">
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
          <UnsubscribeLine m={m} />
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
