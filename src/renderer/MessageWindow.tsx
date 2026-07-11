import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import type { FolderSummary, MailOp, MessageDetail, SnoozeOption } from '@shared/db'
import { fmtFullDate, initials } from './mail/format'
import { buildReplyDraft, type ReplyKind } from './mail/reply'
import { flattenFolderTree } from './mail/folderTree'
import { EmailBody } from './mail/EmailBody'
import { SenderBanners } from './mail/SenderBanners'
import { InviteCard } from './mail/InviteCard'

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

// Toolbar actions. ops that take the message out of the view close the window.
const ACTIONS: { icon: IconName; label: string; op?: MailOp; closes?: boolean; reply?: ReplyKind; print?: boolean }[] = [
  { icon: 'reply', label: 'Reply', reply: 'reply' },
  { icon: 'replyAll', label: 'Reply all', reply: 'replyAll' },
  { icon: 'forward', label: 'Forward', reply: 'forward' },
  { icon: 'archive', label: 'Archive', op: 'archive', closes: true },
  { icon: 'trash', label: 'Delete', op: 'trash', closes: true },
  { icon: 'star', label: 'Star', op: 'flag' },
  { icon: 'print', label: 'Print', print: true }
]

const SNOOZE_OPTS: { label: string; opt: SnoozeOption }[] = [
  { label: 'Later today', opt: 'later' },
  { label: 'Tomorrow', opt: 'tomorrow' },
  { label: 'This weekend', opt: 'weekend' },
  { label: 'Next week', opt: 'nextweek' }
]

export function MessageWindow({ id }: { id: number }): JSX.Element {
  const [curId, setCurId] = useState(id)
  const [m, setM] = useState<MessageDetail | null | 'loading'>('loading')
  const [nav, setNav] = useState<{ prevId: number | null; nextId: number | null }>({ prevId: null, nextId: null })
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [accountColour, setAccountColour] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const w = window.deskmail.window

  useEffect(() => {
    setM('loading')
    void window.deskmail.mail.getMessage(curId).then(setM)
    void window.deskmail.mail.messageNeighbours(curId).then(setNav)
  }, [curId])
  useEffect(() => {
    void window.deskmail.mail.listFolders().then(setFolders)
  }, [])
  // The owning account's colour carries into this window (title-bar underline).
  useEffect(() => {
    if (!m || m === 'loading') return
    void window.deskmail.listAccounts().then((accs) => setAccountColour(accs.find((a) => a.id === m.accountId)?.colour ?? null))
  }, [m])

  const startReply = async (kind: ReplyKind): Promise<void> => {
    if (!m || m === 'loading') return
    const accounts = await window.deskmail.listAccounts()
    const selfEmail = accounts.find((a) => a.id === m.accountId)?.emailAddress
    const { id: draftId } = await window.deskmail.compose.saveDraft(buildReplyDraft(m, kind, selfEmail))
    window.deskmail.openCompose(draftId)
  }

  const chrome = (title: string): JSX.Element => (
    <div
      className="drag-region flex h-[38px] flex-none items-center border-b border-border bg-raised pl-3.5 pr-1.5"
      // Account accent: colours are per-account data, not theme tokens.
      style={accountColour ? { boxShadow: `inset 0 -2px 0 ${accountColour}` } : undefined}
    >
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

  const msg = m
  const moveTargets = flattenFolderTree(folders).filter((n) => n.folder.role !== 'drafts')

  const navTo = (target: number | null): void => {
    if (target != null) { setMoreOpen(false); setCurId(target) }
  }

  return (
    <div data-testid="message-window" data-message-id={msg.id} className="flex h-screen flex-col overflow-hidden bg-panel text-text">
      {chrome(msg.subject || '(no subject)')}

      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            title={a.label}
            onClick={() => {
              if (a.reply) { void startReply(a.reply); return }
              if (a.print) { void window.deskmail.mail.printPdf(msg.id); return }
              if (!a.op) return
              void window.deskmail.mail.action(msg.id, a.op)
              if (a.closes) w.close()
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
          >
            <Icon name={a.icon} size={16} fill={a.icon === 'star' && msg.isStarred} />
            <span>{a.label}</span>
          </button>
        ))}
        <button
          title={msg.isRead ? 'Mark unread' : 'Mark read'}
          onClick={() => { void window.deskmail.mail.markRead(msg.id, !msg.isRead); setM({ ...msg, isRead: !msg.isRead }) }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          <Icon name="markUnread" size={16} />
          <span>{msg.isRead ? 'Mark unread' : 'Mark read'}</span>
        </button>

        <div className="mx-1 h-5 w-px bg-border" />
        <button onClick={() => navTo(nav.prevId)} disabled={nav.prevId == null} title="Previous message" className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 enabled:hover:bg-raised disabled:opacity-35">
          <Icon name="chevronDown" size={16} className="rotate-180" />
        </button>
        <button onClick={() => navTo(nav.nextId)} disabled={nav.nextId == null} title="Next message" className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-2 enabled:hover:bg-raised disabled:opacity-35">
          <Icon name="chevronDown" size={16} />
        </button>

        <div className="relative">
          <button onClick={() => setMoreOpen((v) => !v)} title="More" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
            <Icon name="sliders" size={16} /> <span>More</span>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-[70vh] w-[220px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
                <MoreItem icon={msg.isPinned ? 'pin' : 'pin'} label={msg.isPinned ? 'Unpin' : 'Pin to top'} onClick={() => { setMoreOpen(false); void window.deskmail.mail.pin(msg.id, !msg.isPinned); setM({ ...msg, isPinned: !msg.isPinned }) }} />
                <MoreItem icon="print" label="Save as PDF" onClick={() => { setMoreOpen(false); void window.deskmail.mail.printPdf(msg.id) }} />
                <MoreItem icon="draft" label="Save as .eml" onClick={() => { setMoreOpen(false); void window.deskmail.mail.saveMessage(msg.id, 'eml') }} />
                <MoreItem icon="draft" label="Save as .html" onClick={() => { setMoreOpen(false); void window.deskmail.mail.saveMessage(msg.id, 'html') }} />
                <MoreItem icon="openWindow" label="View source" onClick={() => { setMoreOpen(false); void window.deskmail.mail.messageSource(msg.id).then(setSource) }} />
                <div className="my-1 border-t border-border" />
                <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Snooze</div>
                {SNOOZE_OPTS.map((s) => (
                  <MoreItem key={s.opt} icon="clock" label={s.label} onClick={() => { setMoreOpen(false); void window.deskmail.mail.snooze(msg.id, s.opt); w.close() }} />
                ))}
                <div className="my-1 border-t border-border" />
                <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Move to</div>
                {moveTargets.map(({ folder: f, depth }) => (
                  <button key={f.id} onClick={() => { setMoreOpen(false); void window.deskmail.mail.action(msg.id, 'move', f.id); w.close() }} style={{ paddingLeft: 10 + depth * 14 }} className="block w-full truncate rounded-md py-1.5 pr-2.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />
        <button onClick={() => w.close()} title="Close" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
          <Icon name="close" size={16} />
          <span>Close</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full">
          <h1 className="mb-4 text-[22px] font-bold leading-tight">{msg.subject || '(no subject)'}</h1>
          <div className="flex items-center gap-3.5 border-b border-border pb-[18px]">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[15px] font-bold" style={{ background: AVATAR.bg, color: AVATAR.fg }}>
              {initials(msg.fromName || msg.fromEmail)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold">
                {msg.fromName || msg.fromEmail}{' '}
                {msg.fromEmail && <span className="text-[12.5px] font-normal text-text-3">&lt;{msg.fromEmail}&gt;</span>}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-text-3">to {msg.to.join(', ') || '—'}</div>
            </div>
            <div className="text-[12.5px] text-text-3">{fmtFullDate(msg.receivedAt)}</div>
          </div>

          <div className="-mx-6">
            <SenderBanners m={msg} />
          </div>

          {msg.invite && (
            <div className="-mx-6 mt-4">
              <InviteCard messageId={msg.id} invite={msg.invite} />
            </div>
          )}

          <div className="mt-[18px]">
            <EmailBody html={msg.bodyHtml} text={msg.bodyText} allowByDefault={msg.folderRole !== 'junk'} messageId={msg.id} senderEmail={msg.fromEmail} />
          </div>
        </div>
      </div>

      {source != null && (
        <div className="absolute inset-0 z-30 flex flex-col bg-panel">
          <div className="flex flex-none items-center gap-2 border-b border-border px-3.5 py-2">
            <span className="text-[12.5px] font-bold">Message source</span>
            <div className="flex-1" />
            <button onClick={() => setSource(null)} className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-raised">Close</button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-inset p-4 font-mono text-[11.5px] leading-relaxed text-text-2">{source}</pre>
        </div>
      )}
    </div>
  )
}

function MoreItem({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
      <Icon name={icon} size={14} className="flex-none opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}
