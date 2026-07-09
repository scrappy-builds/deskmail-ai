import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { AccountSummary, Contact, ScheduledSend, Template } from '@shared/db'
import { useToast } from '../store/toastStore'

const inputCls = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] text-text outline-none focus:border-accent'

// --- Signatures ---------------------------------------------------------------
export function SignaturesPane(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [body, setBody] = useState('')
  const [append, setAppend] = useState(true)
  const showToast = useToast((s) => s.show)

  useEffect(() => {
    void window.deskmail.listAccounts().then((a) => {
      setAccounts(a)
      setAccountId(a[0]?.id ?? null)
    })
  }, [])
  useEffect(() => {
    if (accountId == null) return
    void window.deskmail.compose.getSignature(accountId).then((s) => {
      setBody(s?.body ?? '')
      setAppend(s?.appendToNew ?? true)
    })
  }, [accountId])

  if (accounts.length === 0) return <p className="text-[13px] text-text-3">Add an account first, then you can set its signature.</p>

  const save = (): void => {
    if (accountId == null) return
    void window.deskmail.compose.updateSignature(accountId, body, append)
    showToast({ text: 'Signature saved' })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">Your signature is appended to the bottom of new messages. Written in first person — it should sound like you.</p>
      {accounts.length > 1 && (
        <select value={accountId ?? undefined} onChange={(e) => setAccountId(Number(e.target.value))} className={inputCls}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName} — {a.emailAddress}
            </option>
          ))}
        </select>
      )}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${inputCls} min-h-[130px] resize-y leading-relaxed`} aria-label="Signature body" />
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} className="h-4 w-4 accent-accent" />
        <span className="text-[13px] font-semibold">Append to new messages</span>
      </label>
      <div>
        <button onClick={save} className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          Save signature
        </button>
      </div>
    </div>
  )
}

// --- Templates ----------------------------------------------------------------
export function TemplatesPane(): JSX.Element {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const showToast = useToast((s) => s.show)

  const refresh = (): void => void window.deskmail.templates.list().then(setTemplates)
  useEffect(refresh, [])

  const startEdit = (t: Template | 'new'): void => {
    setEditing(t)
    setName(t === 'new' ? '' : t.name)
    setSubject(t === 'new' ? '' : t.subject ?? '')
    setBody(t === 'new' ? '' : t.body ?? '')
  }
  const save = async (): Promise<void> => {
    if (!name.trim()) return
    if (editing === 'new') await window.deskmail.templates.create(name, subject, body)
    else if (editing) await window.deskmail.templates.update(editing.id, name, subject, body)
    setEditing(null)
    refresh()
    showToast({ text: 'Template saved' })
  }
  const remove = async (id: number): Promise<void> => {
    await window.deskmail.templates.remove(id)
    refresh()
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className={inputCls} aria-label="Template name" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={inputCls} aria-label="Template subject" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" className={`${inputCls} min-h-[150px] resize-y leading-relaxed`} aria-label="Template body" />
        <div className="flex gap-2">
          <button onClick={() => void save()} className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">Save</button>
          <button onClick={() => setEditing(null)} className="rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-[13px] leading-relaxed text-text-2">Reusable replies you can drop into a message. Insert them from the Templates button in Compose.</p>
      {templates.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{t.name}</div>
            <div className="truncate text-[12px] text-text-3">{t.subject}</div>
          </div>
          <button onClick={() => startEdit(t)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Edit</button>
          <button onClick={() => void remove(t.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
        </div>
      ))}
      <div>
        <button onClick={() => startEdit('new')} className="mt-2 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          <Icon name="plus" size={16} /> New template
        </button>
      </div>
    </div>
  )
}

// --- Contacts -----------------------------------------------------------------
export function ContactsPane(): JSX.Element {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    void window.deskmail.contacts.list().then(setContacts)
  }, [])
  const shown = query.trim() ? contacts.filter((c) => `${c.name ?? ''} ${c.email ?? ''}`.toLowerCase().includes(query.toLowerCase())) : contacts

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-text-2">People you've emailed or heard from — collected automatically and used for autocomplete in Compose.</p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts" className={inputCls} aria-label="Search contacts" />
      {shown.length === 0 ? (
        <p className="text-[13px] text-text-3">No contacts yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
              <Icon name="contacts" size={16} className="flex-none text-text-3" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{c.name ?? c.email}</div>
                {c.name && <div className="truncate text-[12px] text-text-3">{c.email}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Claude connector (local MCP server) --------------------------------------
export function ClaudeConnectorPane(): JSX.Element {
  const [info, setInfo] = useState<{ configJson: string; tools: string[]; dbPath: string } | null>(null)
  const showToast = useToast((s) => s.show)
  useEffect(() => {
    void window.deskmail.mcp.info().then(setInfo)
  }, [])
  if (!info) return <p className="text-[13px] text-text-3">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-md px-3.5 py-2.5 text-[12.5px] font-semibold" style={{ background: 'var(--claude-soft)', color: 'var(--claude)' }}>
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />
        Local MCP server ready · read &amp; draft only
      </div>
      <p className="text-[13px] leading-relaxed text-text-2">
        Claude Desktop can search, read, summarise and draft across your mail through a local server on
        this PC. It can't send, delete, see your passwords, change settings, or touch anything outside
        DeskMail's own storage — and any draft it writes waits for you to review and send.
      </p>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Available tools</div>
        <div className="flex flex-wrap gap-1.5">
          {info.tools.map((t) => (
            <span key={t} className="rounded-sm border border-border bg-raised px-2 py-1 font-mono text-[11.5px] text-text-2">{t}</span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Connect Claude Desktop</div>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(info.configJson)
              showToast({ text: 'Config copied' })
            }}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-raised"
          >
            Copy
          </button>
        </div>
        <p className="mb-2 text-[12.5px] leading-relaxed text-text-3">
          Add this to Claude Desktop's <span className="font-mono text-text-2">claude_desktop_config.json</span>
          {' '}(Settings → Developer → Edit Config), then restart Claude Desktop.
        </p>
        <pre className="max-h-[220px] overflow-auto rounded-md border border-border bg-inset p-3 font-mono text-[11.5px] leading-relaxed text-text-2">{info.configJson}</pre>
      </div>
    </div>
  )
}

// --- Local storage (backup / restore / portability) ---------------------------
export function LocalStoragePane(): JSX.Element {
  const [info, setInfo] = useState<{ dataDir: string; portable: boolean } | null>(null)
  const showToast = useToast((s) => s.show)
  useEffect(() => {
    void window.deskmail.storage.info().then(setInfo)
  }, [])

  const backup = async (): Promise<void> => {
    const r = await window.deskmail.storage.backup()
    if (r.path) showToast({ text: 'Backup saved' })
  }
  const restore = async (): Promise<void> => {
    const r = await window.deskmail.storage.restore()
    if (r.ok) showToast({ text: 'Backup restored' })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">
        Everything lives on this PC — your mail, calendar, drafts and settings in one local database.
        Back it up to a USB drive or another folder, and restore it on any of your machines.
      </p>

      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Data location</div>
        <div className="mt-1 break-all font-mono text-[12px] text-text-2">{info?.dataDir ?? '…'}</div>
        {info?.portable && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11.5px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            Portable mode — running from this folder
          </div>
        )}
      </div>

      <div className="flex gap-2.5">
        <button onClick={() => void backup()} className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          Back up now
        </button>
        <button onClick={() => void restore()} className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">
          Restore from backup
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-text-3">
        A backup is a single self-contained folder (<span className="font-mono">deskmail-backup-…</span>)
        holding the database, attachments and settings — copy it around freely.
      </p>
    </div>
  )
}

// --- Sending (scheduled sends) ------------------------------------------------
export function SendingPane(): JSX.Element {
  const [scheduled, setScheduled] = useState<ScheduledSend[]>([])
  const refresh = (): void => void window.deskmail.compose.listScheduled().then(setScheduled)
  useEffect(() => {
    refresh()
    return window.deskmail.mail.onChanged(refresh)
  }, [])

  const cancel = async (id: number): Promise<void> => {
    await window.deskmail.compose.cancelScheduled(id)
    refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-text-2">
        Messages you've scheduled for later, and any still inside their undo window. You can cancel a
        scheduled send here until it goes out.
      </p>
      {scheduled.length === 0 ? (
        <p className="text-[13px] text-text-3">Nothing scheduled.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scheduled.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
              <Icon name="clock" size={16} className="flex-none text-text-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{s.subject || '(no subject)'}</div>
                <div className="truncate text-[12px] text-text-3">
                  To {s.to.join(', ') || '—'} · {new Date(s.sendAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <button onClick={() => void cancel(s.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Cancel</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
