import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Icon } from '../Icon'
import { InlineImage } from '../editor/InlineImage'
import type { AccountSummary, ComposeAttachment, ComposePayload, Contact, DraftSummary, SignatureItem, Template } from '@shared/db'
import { mentionsAttachment } from '../mail/reply'
import { useToast } from '../store/toastStore'


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

export function Compose({ draft }: { draft?: DraftSummary }): JSX.Element {
  const w = window.deskmail.window
  const showToast = useToast((s) => s.show)
  // Own window: the mail store isn't initialised here, so fetch accounts directly.
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [accountId, setAccountId] = useState<number | null>(draft?.accountId ?? null)
  const [to, setTo] = useState(draft?.to.join(', ') ?? '')
  const [cc, setCc] = useState(draft?.cc.join(', ') ?? '')
  const [bcc, setBcc] = useState(draft?.bcc.join(', ') ?? '')
  const [showCc, setShowCc] = useState(!!(draft?.cc.length || draft?.bcc.length))
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(draft?.attachments ?? [])
  const [signatures, setSignatures] = useState<SignatureItem[]>([])
  const [signatureId, setSignatureId] = useState<number | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [laterAt, setLaterAt] = useState<string | null>(null)
  const [importance, setImportance] = useState<'high' | 'normal' | 'low'>('normal')
  const [busy, setBusy] = useState(false)

  // Paste/drop images inline; drop other files to attach them.
  const handleFiles = (files: File[]): void => {
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        const r = new FileReader()
        r.onload = () => editor?.chain().focus().insertContent({ type: 'image', attrs: { src: r.result } }).run()
        r.readAsDataURL(f)
      } else {
        const path = (f as File & { path?: string }).path
        if (path) setAttachments((prev) => [...prev, { path, name: f.name, size: f.size }])
      }
    }
  }

  // spellcheck: 'true' turns on Electron's live spell-check underlines in the body.
  const editor = useEditor({
    extensions: [StarterKit, InlineImage],
    content: draft?.bodyHtml ?? '',
    editorProps: {
      attributes: { spellcheck: 'true' },
      handlePaste: (_v, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length === 0) return false
        handleFiles(files)
        return true
      },
      handleDrop: (_v, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        handleFiles(files)
        return true
      }
    }
  })

  useEffect(() => {
    if (accountId == null) return
    void window.deskmail.compose.listSignatures(accountId).then((sigs) => {
      setSignatures(sigs)
      // Preselect the default signature when it's set to append to new messages.
      const def = sigs.find((s) => s.isDefault)
      setSignatureId(def && def.appendToNew ? def.id : null)
    })
  }, [accountId])
  useEffect(() => {
    void window.deskmail.listAccounts().then((a) => {
      setAccounts(a)
      setAccountId((cur) => cur ?? a[0]?.id ?? null)
    })
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
      attachments,
      signatureId,
      importance
    }),
    [draft, accountId, to, cc, bcc, subject, editor, attachments, signatureId, importance]
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
      // Keep the window open after saving — the draft is in Drafts and the user
      // may want to carry on editing (matches a normal mail client).
    } finally {
      setBusy(false)
    }
  }

  // Sending is always user-initiated. Immediate send goes via an undo window;
  // "Send later" schedules for the chosen time. Neither leaves without the click.
  const send = async (): Promise<void> => {
    if (!canSend) return
    // Attachment reminder: the message hints at a file but none is attached.
    if (attachments.length === 0 && mentionsAttachment(`${subject}\n${editor?.getText() ?? ''}`)) {
      if (!window.confirm("It looks like you mentioned an attachment but haven't added one. Send anyway?")) return
    }
    setBusy(true)
    if (laterAt) {
      await window.deskmail.compose.scheduleSend(payload, new Date(laterAt).toISOString())
      showToast({ text: `Scheduled for ${new Date(laterAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` })
      setTimeout(() => w.close(), 1200)
      return
    }
    const res = await window.deskmail.compose.sendWithUndo(payload)
    if (res.id == null) {
      // Undo window set to 0 — the message went straight out.
      showToast({ text: res.ok ? 'Message sent' : `Couldn't send: ${res.error ?? 'unknown error'}` })
      if (res.ok) setTimeout(() => w.close(), 900)
      else setBusy(false)
      return
    }
    const id = res.id
    const toastMs = Math.max(2000, res.seconds * 1000 - 1000)
    // Keep this window open for the undo window so the Undo button stays reachable,
    // then close once it has elapsed. (Its own window, so we can't hand the toast
    // off to the main window the way the in-app overlay used to.)
    showToast(
      {
        text: 'Sending your message…',
        actionLabel: 'Undo',
        onAction: () => {
          void window.deskmail.compose.cancelScheduled(id)
          w.close()
        }
      },
      toastMs
    )
    setTimeout(() => w.close(), toastMs)
  }

  const field = 'flex items-center gap-2.5 border-b border-border px-4 py-2'
  const inputCls = 'flex-1 border-none bg-transparent text-[13.5px] text-text outline-none'

  return (
    <div className="flex h-screen flex-col bg-panel text-text">
      <div className="drag-region flex h-[38px] flex-none items-center border-b border-border bg-raised pl-4 pr-1.5">
        <span className="text-[12.5px] font-semibold text-text-2">New message — DeskMail AI</span>
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
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as 'high' | 'normal' | 'low')}
              title="Message priority"
              aria-label="Message priority"
              className="rounded-md border border-border bg-bg px-2 py-1 text-[12px] font-semibold text-text-2 outline-none focus:border-accent"
            >
              <option value="normal">Normal</option>
              <option value="high">High priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>

          <EditorContent editor={editor} className="min-h-[130px] flex-1 px-4 py-3 text-[14px] leading-[1.6]" />

          {signatures.length > 0 && (
            <div className="mx-4 mb-3 border-t border-dashed border-border pt-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[.5px] text-text-3">Signature</span>
                <select
                  value={signatureId ?? ''}
                  onChange={(e) => setSignatureId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-accent"
                >
                  <option value="">None</option>
                  {signatures.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.isDefault ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
              {signatureId != null && (
                <div
                  className="text-[12.5px] leading-relaxed text-text-3"
                  dangerouslySetInnerHTML={{ __html: signatures.find((s) => s.id === signatureId)?.body ?? '' }}
                />
              )}
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
  )
}
