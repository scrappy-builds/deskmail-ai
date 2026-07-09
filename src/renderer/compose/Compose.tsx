import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Icon } from '../Icon'
import type { ComposeAttachment, ComposePayload, Contact, DraftSummary, SignatureData, Template } from '@shared/db'
import { useMail } from '../store/mailStore'
import { useToast } from '../store/toastStore'

const REWRITE = ['Make clearer', 'Warmer', 'More professional', 'Shorten', 'Expand', 'Fix spelling & grammar']

function splitAddrs(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
// Plain template body → simple paragraph HTML for the editor.
function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/</g, '&lt;')}</p>`)
    .join('')
}

export function Compose({ onClose, draft }: { onClose: () => void; draft?: DraftSummary }): JSX.Element {
  const accounts = useMail((s) => s.accounts)
  const showToast = useToast((s) => s.show)
  const [accountId, setAccountId] = useState<number | null>(draft?.accountId ?? accounts[0]?.id ?? null)
  const [to, setTo] = useState(draft?.to.join(', ') ?? '')
  const [cc, setCc] = useState(draft?.cc.join(', ') ?? '')
  const [bcc, setBcc] = useState(draft?.bcc.join(', ') ?? '')
  const [showCc, setShowCc] = useState(!!(draft?.cc.length || draft?.bcc.length))
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([])
  const [signature, setSignature] = useState<SignatureData | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [laterAt, setLaterAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const editor = useEditor({ extensions: [StarterKit], content: draft?.bodyHtml ?? '' })

  useEffect(() => {
    if (accountId != null) void window.deskmail.compose.getSignature(accountId).then(setSignature)
  }, [accountId])
  useEffect(() => {
    void window.deskmail.templates.list().then(setTemplates)
    void window.deskmail.contacts.list().then(setContacts)
  }, [])

  const payload = useMemo(
    (): ComposePayload => ({
      draftId: draft?.id ?? null, // so Save/Send updates the existing draft
      accountId: accountId ?? 0,
      to: splitAddrs(to),
      cc: splitAddrs(cc),
      bcc: splitAddrs(bcc),
      subject,
      bodyHtml: editor?.getHTML() ?? '',
      attachments
    }),
    [draft, accountId, to, cc, bcc, subject, editor, attachments]
  )

  const canSend = accountId != null && payload.to.length > 0 && !busy

  const attach = async (): Promise<void> => {
    const files = await window.deskmail.compose.pickAttachments()
    if (files.length) setAttachments((prev) => [...prev, ...files])
  }

  const applyTemplate = (t: Template): void => {
    if (!subject && t.subject) setSubject(t.subject)
    if (t.body) editor?.chain().focus().insertContent(bodyToHtml(t.body)).run()
    setShowTemplates(false)
  }

  const saveDraft = async (): Promise<void> => {
    if (accountId == null) return
    setBusy(true)
    try {
      await window.deskmail.compose.saveDraft(payload)
      showToast({ text: 'Draft saved' })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  // Sending is always user-initiated. Immediate send goes via an undo window;
  // "Send later" schedules for the chosen time. Neither leaves without the click.
  const send = async (): Promise<void> => {
    if (!canSend) return
    setBusy(true)
    if (laterAt) {
      await window.deskmail.compose.scheduleSend(payload, new Date(laterAt).toISOString())
      showToast({ text: `Scheduled for ${new Date(laterAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` })
      onClose()
      return
    }
    const { id } = await window.deskmail.compose.sendWithUndo(payload)
    showToast(
      {
        text: 'Sending your message…',
        actionLabel: 'Undo',
        onAction: () => void window.deskmail.compose.cancelScheduled(id)
      },
      9000
    )
    onClose()
  }

  const field = 'flex items-center gap-2.5 border-b border-border px-4 py-2'
  const inputCls = 'flex-1 border-none bg-transparent text-[13.5px] text-text outline-none'

  return (
    <div className="absolute inset-0 z-[65] flex items-end justify-center" style={{ background: 'rgba(5,6,10,0.5)' }}>
      <div className="flex h-[min(640px,90vh)] w-[min(760px,94vw)] flex-col rounded-t-lg border border-border bg-panel shadow-raised">
        <div className="flex flex-none items-center rounded-t-lg border-b border-border bg-raised px-4 py-3">
          <span className="text-[13.5px] font-bold">New message</span>
          <div className="flex-1" />
          <button onClick={onClose} className="flex rounded-md p-1.5 text-text-2 hover:bg-danger hover:text-white" title="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className={field}>
            <span className="w-[52px] text-[12.5px] text-text-3">From</span>
            {accounts.length === 0 ? (
              <span className="text-[13px] text-text-3">Add an account first (File → Settings)</span>
            ) : (
              <select value={accountId ?? undefined} onChange={(e) => setAccountId(Number(e.target.value))} className="flex-1 border-none bg-transparent text-[13px] font-semibold text-text outline-none">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} — {a.emailAddress}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={field}>
            <span className="w-[52px] text-[12.5px] text-text-3">To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipients (comma separated)" className={inputCls} aria-label="To" list="contact-emails" />
            <datalist id="contact-emails">
              {contacts.filter((c) => c.email).map((c) => (
                <option key={c.id} value={c.email ?? ''}>
                  {c.name ?? c.email}
                </option>
              ))}
            </datalist>
            <button onClick={() => setShowCc((v) => !v)} className="text-[12px] font-semibold text-text-3 hover:text-accent">
              Cc Bcc
            </button>
          </div>
          {showCc && (
            <>
              <div className={field}>
                <span className="w-[52px] text-[12.5px] text-text-3">Cc</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} className={inputCls} aria-label="Cc" />
              </div>
              <div className={field}>
                <span className="w-[52px] text-[12.5px] text-text-3">Bcc</span>
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} className={inputCls} aria-label="Bcc" />
              </div>
            </>
          )}

          <div className={field}>
            <span className="w-[52px] text-[12.5px] text-text-3">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={`${inputCls} font-semibold`} aria-label="Subject" />
            <div className="relative">
              <button onClick={() => setShowTemplates((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-raised" title="Insert a template">
                <Icon name="draft" size={14} /> Templates
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full z-10 mt-1 w-[240px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
                  {templates.length === 0 ? (
                    <div className="px-2.5 py-2 text-[12px] text-text-3">No templates yet.</div>
                  ) : (
                    templates.map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5" style={{ background: 'var(--claude-soft)' }}>
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-claude">
              <Icon name="claude" size={14} fill /> Rewrite
            </span>
            {REWRITE.map((r) => (
              <span key={r} title="Rewrite with Claude (coming with the Claude connector)" className="cursor-not-allowed rounded-pill border border-claude bg-panel px-2.5 py-1 text-[12px] font-semibold text-claude opacity-70">
                {r}
              </span>
            ))}
          </div>

          <EditorContent editor={editor} className="min-h-[130px] flex-1 px-4 py-3 text-[14px] leading-[1.6]" />

          {signature?.appendToNew && signature.body && (
            <div className="mx-4 mb-3 border-t border-dashed border-border pt-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.5px] text-text-3">Signature</div>
              <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-text-3">{signature.body}</div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5">
                  <Icon name="clip" size={14} className="text-text-3" />
                  <div className="min-w-0">
                    <div className="max-w-[150px] truncate text-[12px] font-semibold">{a.name}</div>
                    <div className="text-[10px] text-text-3">{fmtSize(a.size)}</div>
                  </div>
                  <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="text-text-3 hover:text-danger" title="Remove">
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {laterAt !== null && (
            <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
              <span className="text-[12px] font-semibold text-text-2">Send at</span>
              <input type="datetime-local" value={laterAt} onChange={(e) => setLaterAt(e.target.value)} aria-label="Send at" className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent" />
              <button onClick={() => setLaterAt(null)} className="text-[12px] font-semibold text-text-3 hover:text-danger">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-2.5 border-t border-border px-4 py-3">
          <button onClick={() => void send()} disabled={!canSend || (laterAt !== null && !laterAt)} className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-accent-fg hover:bg-accent-2 disabled:opacity-40">
            <Icon name="send" size={15} /> {laterAt !== null ? 'Schedule' : 'Send'}
          </button>
          {laterAt === null && (
            <button onClick={() => setLaterAt('')} className="rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised" title="Send later">
              Send later
            </button>
          )}
          <button onClick={() => void saveDraft()} disabled={busy || accountId == null} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised disabled:opacity-40">
            <Icon name="draft" size={15} /> Save draft
          </button>
          <button onClick={() => void attach()} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">
            <Icon name="clip" size={15} /> Attach
          </button>
          <div className="flex-1" />
        </div>
      </div>
    </div>
  )
}
