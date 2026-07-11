import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Icon } from '../Icon'
import { InlineImage } from '../editor/InlineImage'
import { PLATFORMS, buildSocialRow, splitSocial, parseSocialRow } from './socialIcons'
import type { AccountSummary, ContactDetail, ContactInput, FolderSummary, LabelInfo, NotifySettings, Rule, RuleAction, RuleField, RuleInput, RuleOp, ScheduledSend, SignatureItem, Template } from '@shared/db'
import { DEFAULT_KEYMAP, RESERVED_KEYS, SHORTCUTS, type Keymap, type ShortcutAction } from '@shared/shortcuts'
import { useToast } from '../store/toastStore'

const inputCls = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] text-text outline-none focus:border-accent'

// --- Notifications / tray / Focus-DND -----------------------------------------
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }): JSX.Element {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-3 text-left hover:bg-hover">
      <span className="inline-flex h-5 w-9 flex-none items-center rounded-full p-0.5" style={{ background: on ? 'var(--accent)' : 'var(--border-2)' }}>
        <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(16px)' : 'none' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint && <span className="block text-[11.5px] text-text-3">{hint}</span>}
      </span>
    </button>
  )
}

export function NotificationsPane(): JSX.Element {
  const [s, setS] = useState<NotifySettings | null>(null)
  const [idle, setIdle] = useState(true)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    void window.deskmail.notify.get().then(setS)
    void window.deskmail.mail.idleEnabled().then(setIdle)
    void window.deskmail.mail.focusedEnabled().then(setFocused)
  }, [])
  const patch = (p: Partial<NotifySettings>): void => {
    void window.deskmail.notify.set(p).then(setS)
  }
  const toggleIdle = (v: boolean): void => {
    setIdle(v)
    void window.deskmail.mail.setIdleEnabled(v)
  }
  const toggleFocused = (v: boolean): void => {
    setFocused(v)
    void window.deskmail.mail.setFocusedEnabled(v)
  }
  if (!s) return <div className="text-[13px] text-text-3">Loading…</div>

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-text-2">
        Get a desktop alert when new mail lands, keep DeskMail in the system tray, and mute alerts on a
        schedule (or on demand) when you need to focus.
      </p>
      <Toggle on={s.enabled} onChange={(v) => patch({ enabled: v })} label="New-mail notifications" hint="Show a desktop alert for new inbox mail." />
      <Toggle on={idle} onChange={toggleIdle} label="Instant new mail (push)" hint="The mail server tells DeskMail the moment something arrives, instead of waiting for the next check. Turn off if your provider dislikes long-lived connections." />
      <Toggle on={focused} onChange={toggleFocused} label="Focused inbox" hint="Split the Inbox into Focused and Other, learned from your own behaviour. Move messages between the tabs to teach it; only Focused mail notifies." />
      <Toggle on={s.launchAtStartup} onChange={(v) => patch({ launchAtStartup: v })} label="Start DeskMail when Windows starts" hint="Launch automatically in the background when you sign in." />
      <Toggle on={s.minimiseToTray} onChange={(v) => patch({ minimiseToTray: v })} label="Minimise to tray" hint="Closing or minimising hides to the tray instead of quitting." />
      <Toggle on={s.focusNow} onChange={(v) => patch({ focusNow: v })} label="Focus — mute notifications now" hint="Silence alerts until you turn this back off." />

      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <Toggle on={s.dndEnabled} onChange={(v) => patch({ dndEnabled: v })} label="Do Not Disturb schedule" hint="Automatically mute alerts during these hours." />
        {s.dndEnabled && (
          <div className="mt-2.5 flex items-center gap-2.5 pl-1 text-[12.5px] text-text-2">
            From
            <input type="time" value={s.dndFrom} onChange={(e) => patch({ dndFrom: e.target.value })} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent" />
            to
            <input type="time" value={s.dndTo} onChange={(e) => patch({ dndTo: e.target.value })} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          </div>
        )}
      </div>
    </div>
  )
}

// --- Rules / filters ----------------------------------------------------------
const FIELD_LABELS: Record<RuleField, string> = { from: 'From', subject: 'Subject', to: 'To', body: 'Body' }
const OP_LABELS: Record<RuleOp, string> = { contains: 'contains', equals: 'equals', startswith: 'starts with' }
const ACTION_LABELS: Record<RuleAction, string> = { move: 'Move to folder', label: 'Apply label', star: 'Star', read: 'Mark read', junk: 'Move to Junk', archive: 'Archive' }

const BLANK_RULE: RuleInput = { name: '', enabled: true, field: 'from', op: 'contains', value: '', action: 'star', targetFolderId: null, targetLabelId: null }

export function RulesPane(): JSX.Element {
  const [rules, setRules] = useState<Rule[]>([])
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [labels, setLabels] = useState<LabelInfo[]>([])
  const [draft, setDraft] = useState<RuleInput>(BLANK_RULE)
  const showToast = useToast((s) => s.show)

  const refresh = (): void => void window.deskmail.rules.list().then(setRules)
  useEffect(() => {
    refresh()
    void window.deskmail.mail.listFolders().then((f) => setFolders(f.filter((x) => x.role !== 'drafts')))
    void window.deskmail.labels.list().then(setLabels)
  }, [])

  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]): void => setDraft((p) => ({ ...p, [k]: v }))

  const add = async (): Promise<void> => {
    const name = draft.name.trim() || `${FIELD_LABELS[draft.field]} ${OP_LABELS[draft.op]} “${draft.value.trim()}”`
    if (!draft.value.trim()) {
      showToast({ text: 'Give the rule something to match on.' })
      return
    }
    await window.deskmail.rules.create({ ...draft, name })
    setDraft(BLANK_RULE)
    refresh()
  }
  const toggle = async (r: Rule): Promise<void> => {
    await window.deskmail.rules.update(r.id, { ...r, enabled: !r.enabled })
    refresh()
  }
  const remove = async (id: number): Promise<void> => {
    await window.deskmail.rules.remove(id)
    refresh()
  }

  const needsFolder = draft.action === 'move'
  const needsLabel = draft.action === 'label'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">
        Rules run automatically on new mail as it arrives — a quick way to file, star or tidy without
        lifting a finger. Each rule is one condition and one action.
      </p>

      <div className="rounded-lg border border-border p-3.5">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">New rule</div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-text-2">When</span>
          <select value={draft.field} onChange={(e) => set('field', e.target.value as RuleField)} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
            {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
          </select>
          <select value={draft.op} onChange={(e) => set('op', e.target.value as RuleOp)} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
            {(Object.keys(OP_LABELS) as RuleOp[]).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
          </select>
          <input value={draft.value} onChange={(e) => set('value', e.target.value)} placeholder="text to match" className="min-w-[140px] flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-text-2">then</span>
          <select value={draft.action} onChange={(e) => set('action', e.target.value as RuleAction)} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
            {(Object.keys(ACTION_LABELS) as RuleAction[]).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
          {needsFolder && (
            <select value={draft.targetFolderId ?? ''} onChange={(e) => set('targetFolderId', e.target.value ? Number(e.target.value) : null)} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
              <option value="">choose folder…</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {needsLabel && (
            <select value={draft.targetLabelId ?? ''} onChange={(e) => set('targetLabelId', e.target.value ? Number(e.target.value) : null)} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
              <option value="">choose label…</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button onClick={() => void add()} className="rounded-md bg-accent px-3.5 py-1.5 font-semibold text-accent-fg hover:bg-accent-2">Add rule</button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-2 p-5 text-center text-[12.5px] text-text-3">No rules yet.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
              <button onClick={() => void toggle(r)} title={r.enabled ? 'Enabled' : 'Disabled'} className="flex-none">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border" style={{ borderColor: r.enabled ? 'var(--accent)' : 'var(--border-2)', background: r.enabled ? 'var(--accent)' : 'transparent' }}>
                  {r.enabled && <Icon name="check" size={12} className="text-accent-fg" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ opacity: r.enabled ? 1 : 0.55 }}>{r.name}</div>
                <div className="truncate text-[11.5px] text-text-3">
                  {FIELD_LABELS[r.field]} {OP_LABELS[r.op]} “{r.value}” → {ACTION_LABELS[r.action]}
                </div>
              </div>
              <button onClick={() => void remove(r.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Signatures (multiple per account, plain text or rich HTML) ---------------
// A body is HTML if it contains any tag — same heuristic the send path uses to
// decide whether to escape it. A plain default like "Thanks,\nAlex" is text.
function isHtmlBody(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body)
}
function htmlToPlain(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}
function plainToHtml(text: string): string {
  return text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')
}

function RichSignatureEditor({ initial, onSave, onCancel }: { initial: { name: string; body: string }; onSave: (name: string, body: string) => void; onCancel: () => void }): JSX.Element {
  const [name, setName] = useState(initial.name)
  const [mode, setMode] = useState<'plain' | 'html'>(isHtmlBody(initial.body) ? 'html' : 'plain')

  // Pull any existing social block out so the rich editor never sees it (TipTap
  // would drop the <div>/data attributes); we rebuild it on save.
  const split = splitSocial(initial.body)
  const [plain, setPlain] = useState(mode === 'plain' ? initial.body : htmlToPlain(split.main))

  // Social selections, prefilled from an existing block. `order` drives the row
  // order (reorderable); `urls` holds the link for each ticked platform. A
  // platform is included when it's ticked (present in urls) with a non-blank URL.
  const initialLinks = parseSocialRow(split.social)
  const [order, setOrder] = useState<string[]>(() => {
    const picked = initialLinks.map((l) => l.id)
    return [...picked, ...PLATFORMS.map((p) => p.id).filter((id) => !picked.includes(id))]
  })
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const l of initialLinks) o[l.id] = l.url
    return o
  })
  const moveSocial = (id: string, dir: -1 | 1): void => setOrder((o) => {
    const i = o.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= o.length) return o
    const n = [...o]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })

  const [showSource, setShowSource] = useState(false)
  const [source, setSource] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const insertImageFiles = (files: File[]): void => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const r = new FileReader()
      r.onload = () => editor?.chain().focus().insertContent({ type: 'image', attrs: { src: r.result } }).run()
      r.readAsDataURL(f)
    }
  }

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), InlineImage],
    content: split.main,
    editorProps: {
      attributes: { spellcheck: 'true' },
      handlePaste: (_v, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length === 0) return false
        insertImageFiles(files)
        return true
      },
      handleDrop: (_v, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        insertImageFiles(files)
        return true
      }
    }
  })

  const switchMode = (next: 'plain' | 'html'): void => {
    if (next === mode) return
    if (next === 'plain') setPlain(htmlToPlain(showSource ? source : editor?.getHTML() ?? ''))
    else editor?.commands.setContent(plainToHtml(plain))
    setShowSource(false)
    setMode(next)
  }

  const toggleSource = (): void => {
    if (!showSource) setSource(editor?.getHTML() ?? '')
    else editor?.commands.setContent(source)
    setShowSource((v) => !v)
  }

  const applyLink = (): void => {
    const url = linkUrl.trim()
    if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    else editor?.chain().focus().unsetLink().run()
    setLinkOpen(false)
    setLinkUrl('')
  }

  const save = (): void => {
    const nm = name.trim() || 'Untitled'
    if (mode === 'plain') return onSave(nm, plain)
    const mainHtml = showSource ? source : editor?.getHTML() ?? ''
    const links = order.filter((id) => (urls[id] ?? '').trim()).map((id) => ({ id, url: urls[id] }))
    onSave(nm, mainHtml + buildSocialRow(links))
  }

  const btn = (label: string, active: boolean, on: () => void): JSX.Element => (
    <button onClick={on} className="rounded px-2 py-1 text-[12px] font-bold" style={active ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--text-2)' }}>
      {label}
    </button>
  )
  const modeTab = (val: 'plain' | 'html', label: string): JSX.Element => (
    <button onClick={() => switchMode(val)} className="rounded px-3 py-1 text-[12px] font-semibold" style={mode === val ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--text-2)' }}>
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Signature name (e.g. Work, Personal)" className={inputCls} />

      <div className="flex items-center gap-1 self-start rounded-md border border-border bg-inset p-1">
        {modeTab('plain', 'Plain text')}
        {modeTab('html', 'HTML')}
      </div>

      {mode === 'plain' ? (
        <textarea value={plain} onChange={(e) => setPlain(e.target.value)} placeholder="Type your signature…" className={`${inputCls} min-h-[110px] resize-y font-mono`} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-inset p-1">
            {btn('B', editor?.isActive('bold') ?? false, () => editor?.chain().focus().toggleBold().run())}
            {btn('I', editor?.isActive('italic') ?? false, () => editor?.chain().focus().toggleItalic().run())}
            {btn('U', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run())}
            {btn('H', editor?.isActive('heading', { level: 2 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
            {btn('• List', editor?.isActive('bulletList') ?? false, () => editor?.chain().focus().toggleBulletList().run())}
            {btn('1. List', editor?.isActive('orderedList') ?? false, () => editor?.chain().focus().toggleOrderedList().run())}
            {btn('Link', editor?.isActive('link') ?? false, () => { setLinkUrl(editor?.getAttributes('link').href ?? ''); setLinkOpen((v) => !v) })}
            {btn('Image', false, () => fileRef.current?.click())}
            {btn('</> HTML', showSource, toggleSource)}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { insertImageFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          </div>

          {linkOpen && (
            <div className="flex items-center gap-2">
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLink()} placeholder="https://…" className={inputCls} autoFocus />
              <button onClick={applyLink} className="rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-accent-fg">Apply</button>
            </div>
          )}

          {showSource ? (
            <textarea value={source} onChange={(e) => setSource(e.target.value)} placeholder="<p>Raw HTML…</p>" className={`${inputCls} min-h-[130px] resize-y font-mono text-[12px]`} />
          ) : (
            <EditorContent editor={editor} className="min-h-[110px] rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] leading-relaxed" />
          )}

          <div className="rounded-md border border-border bg-bg p-3">
            <div className="mb-1 text-[12px] font-semibold text-text-2">Social icons (embedded, so they show even when images are blocked)</div>
            <div className="mb-2 text-[11.5px] text-text-3">Tick the platforms you want and paste each link. Use the arrows to set the order they appear in — they sit in a horizontal row at the foot of the signature.</div>
            <div className="flex flex-col gap-1.5">
              {order.map((id, i) => {
                const p = PLATFORMS.find((x) => x.id === id)!
                const on = id in urls
                return (
                  <div key={id} className="flex items-center gap-2.5">
                    <div className="flex flex-none flex-col">
                      <button onClick={() => moveSocial(id, -1)} disabled={i === 0} className="px-1 text-[10px] leading-none text-text-3 hover:text-text disabled:opacity-30" title="Move up">▲</button>
                      <button onClick={() => moveSocial(id, 1)} disabled={i === order.length - 1} className="px-1 text-[10px] leading-none text-text-3 hover:text-text disabled:opacity-30" title="Move down">▼</button>
                    </div>
                    <label className="flex w-32 flex-none items-center gap-2 text-[12.5px]">
                      <input type="checkbox" checked={on} onChange={(e) => setUrls((s) => { const n = { ...s }; if (e.target.checked) n[id] = n[id] ?? ''; else delete n[id]; return n })} className="h-4 w-4 accent-accent" />
                      {p.label}
                    </label>
                    {on && <input value={urls[id]} onChange={(e) => setUrls((s) => ({ ...s, [id]: e.target.value }))} placeholder={p.placeholder} className={`${inputCls} flex-1`} />}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2.5">
        <button onClick={save} className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">Save</button>
        <button onClick={onCancel} className="rounded-md px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Cancel</button>
      </div>
    </div>
  )
}

export function SignaturesPane(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [sigs, setSigs] = useState<SignatureItem[]>([])
  const [editing, setEditing] = useState<{ id: number | null; name: string; body: string } | null>(null)
  const showToast = useToast((s) => s.show)

  const refresh = (): void => {
    if (accountId != null) void window.deskmail.compose.listSignatures(accountId).then(setSigs)
  }
  useEffect(() => {
    void window.deskmail.listAccounts().then((a) => {
      setAccounts(a)
      setAccountId(a[0]?.id ?? null)
    })
  }, [])
  useEffect(refresh, [accountId])

  if (accounts.length === 0) return <p className="text-[13px] text-text-3">Add an account first, then you can set its signatures.</p>

  const appendOn = sigs.find((s) => s.isDefault)?.appendToNew ?? true

  const saveEdit = async (name: string, body: string): Promise<void> => {
    if (accountId == null || !editing) return
    if (editing.id == null) await window.deskmail.compose.createSignature(accountId, name, body)
    else await window.deskmail.compose.updateSignatureById(editing.id, name, body)
    setEditing(null)
    refresh()
    showToast({ text: 'Signature saved' })
  }

  if (editing) return <RichSignatureEditor initial={{ name: editing.name, body: editing.body }} onSave={(n, b) => void saveEdit(n, b)} onCancel={() => setEditing(null)} />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">Signatures go at the bottom of your messages — written in first person, so they sound like you. Keep several and pick one when composing.</p>
      {accounts.length > 1 && (
        <select value={accountId ?? undefined} onChange={(e) => setAccountId(Number(e.target.value))} className={inputCls}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName} — {a.emailAddress}</option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
        <input type="checkbox" checked={appendOn} onChange={(e) => { if (accountId != null) void window.deskmail.compose.setSignatureAppend(accountId, e.target.checked).then(refresh) }} className="h-4 w-4 accent-accent" />
        <span className="text-[13px] font-semibold">Append the default signature to new messages</span>
      </label>

      <div className="flex flex-col gap-1.5">
        {sigs.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                {s.name}
                {s.isDefault && <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>DEFAULT</span>}
              </div>
              <div className="truncate text-[12px] text-text-3" dangerouslySetInnerHTML={{ __html: s.body }} />
            </div>
            {!s.isDefault && (
              <button onClick={() => { if (accountId != null) void window.deskmail.compose.setDefaultSignature(accountId, s.id).then(refresh) }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:underline">Make default</button>
            )}
            <button onClick={() => setEditing({ id: s.id, name: s.name, body: s.body })} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Edit</button>
            <button onClick={() => void window.deskmail.compose.deleteSignature(s.id).then(refresh)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
          </div>
        ))}
      </div>

      <div>
        <button onClick={() => setEditing({ id: null, name: '', body: '' })} className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          <Icon name="plus" size={15} /> Add signature
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
const BLANK_CONTACT: ContactInput = { name: '', email: '', org: '', notes: '', groups: [] }

export function ContactsPane(): JSX.Element {
  const [contacts, setContacts] = useState<ContactDetail[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string>('') // '' = all
  const [editing, setEditing] = useState<{ id: number | null; input: ContactInput } | null>(null)
  const showToast = useToast((s) => s.show)

  const refresh = (): void => {
    void window.deskmail.contacts.listDetail().then(setContacts)
    void window.deskmail.contacts.groups().then(setGroups)
  }
  useEffect(refresh, [])

  const shown = contacts.filter((c) => {
    const q = query.trim().toLowerCase()
    const matchQ = !q || `${c.name ?? ''} ${c.email ?? ''} ${c.org ?? ''}`.toLowerCase().includes(q)
    const matchG = !group || c.groups.includes(group)
    return matchQ && matchG
  })

  const save = async (): Promise<void> => {
    if (!editing) return
    const input = editing.input
    if (!input.name?.trim() && !input.email?.trim()) {
      showToast({ text: 'Give the contact a name or an email.' })
      return
    }
    if (editing.id == null) await window.deskmail.contacts.create(input)
    else await window.deskmail.contacts.update(editing.id, input)
    setEditing(null)
    refresh()
  }
  const remove = async (id: number): Promise<void> => {
    await window.deskmail.contacts.remove(id)
    refresh()
  }

  if (editing) {
    const c = editing.input
    const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]): void => setEditing({ id: editing.id, input: { ...c, [k]: v } })
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[14px] font-bold">{editing.id == null ? 'New contact' : 'Edit contact'}</div>
        <input className={inputCls} placeholder="Name" value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <input className={inputCls} placeholder="Email" value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        <input className={inputCls} placeholder="Organisation (optional)" value={c.org ?? ''} onChange={(e) => set('org', e.target.value)} />
        <input className={inputCls} placeholder="Groups — comma separated (e.g. Clients, Suppliers)" value={c.groups.join(', ')} onChange={(e) => set('groups', e.target.value.split(',').map((g) => g.trim()).filter(Boolean))} />
        <textarea className={`${inputCls} min-h-[80px] resize-y`} placeholder="Notes (optional)" value={c.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        <div className="flex gap-2.5">
          <button onClick={() => void save()} className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">Save</button>
          <button onClick={() => setEditing(null)} className="rounded-md px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-text-2">People you've emailed or heard from — collected automatically, and you can add or edit them here. Groups make quick lists for addressing.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts" className="min-w-[160px] flex-1 rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:border-accent" aria-label="Search contacts" />
        {groups.length > 0 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-md border border-border bg-bg px-2.5 py-2 text-[13px] outline-none focus:border-accent">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <button onClick={() => setEditing({ id: null, input: { ...BLANK_CONTACT } })} className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          <Icon name="plus" size={15} /> Add
        </button>
        <button onClick={() => void window.deskmail.contacts.importVcf().then((r) => { if (r.count) { refresh(); showToast({ text: `Imported ${r.count} contact${r.count > 1 ? 's' : ''}` }) } })} className="rounded-md border border-border px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-raised" title="Import contacts from a .vcf file">
          Import
        </button>
        <button onClick={() => void window.deskmail.contacts.exportVcf().then((r) => { if (r.path) showToast({ text: 'Contacts exported' }) })} className="rounded-md border border-border px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-raised" title="Export all contacts to a .vcf file">
          Export
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px] text-text-3">No contacts{group ? ` in “${group}”` : ''} yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
              <Icon name="contacts" size={16} className="flex-none text-text-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{c.name ?? c.email}</div>
                <div className="truncate text-[12px] text-text-3">
                  {c.name ? c.email : c.org}{c.groups.length > 0 && <span className="text-accent"> · {c.groups.join(', ')}</span>}
                </div>
              </div>
              <button onClick={() => setEditing({ id: c.id, input: { name: c.name, email: c.email, org: c.org, notes: c.notes, groups: c.groups } })} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Edit</button>
              <button onClick={() => void remove(c.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Security & junk ----------------------------------------------------------
// --- Sync (history depth) -----------------------------------------------------
// How far back the background back-fill fetches. The newest page of every folder
// is always seeded immediately; this caps how much older history follows.
const DEPTH_OPTS: { label: string; days: number }[] = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last year', days: 365 },
  { label: 'Last 2 years', days: 730 },
  { label: 'Everything', days: 0 }
]
export function SyncPane(): JSX.Element {
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => {
    void window.deskmail.mail.syncDepthGet().then(setDays)
  }, [])
  const choose = (d: number): void => {
    setDays(d)
    void window.deskmail.mail.syncDepthSet(d)
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-[13.5px] font-semibold">How much mail to keep on this PC</div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-text-3">
          I always fetch the newest messages in every folder straight away. This setting decides how
          far back I keep filling in older mail. More history means a bigger local database — your mail
          stays on the server either way, so you can raise this later and I'll fetch the rest.
        </p>
        <div className="flex flex-col gap-1.5">
          {DEPTH_OPTS.map((o) => (
            <label key={o.days} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
              <input type="radio" name="sync-depth" checked={days === o.days} onChange={() => choose(o.days)} className="h-4 w-4 accent-accent" />
              <span className="text-[13px] font-semibold">{o.label}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-text-3">
        Older mail loads in the background after the app opens. You can also press{' '}
        <span className="font-semibold text-text-2">Load older messages</span> at the bottom of any
        folder to pull the next chunk on demand.
      </p>
    </div>
  )
}

// --- Keyboard shortcuts -------------------------------------------------------
// Master on/off plus a per-action rebind. "Rebind" captures the next key press;
// Escape cancels, Clear unbinds. The cheat-sheet ('?') renders from the same map.
export function ShortcutsPane(): JSX.Element {
  const [enabled, setEnabled] = useState(true)
  const [map, setMap] = useState<Keymap>(DEFAULT_KEYMAP)
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null)
  const showToast = useToast((s) => s.show)

  useEffect(() => {
    void window.deskmail.shortcuts.get().then((c) => {
      setEnabled(c.enabled)
      setMap(c.map)
    })
  }, [])

  const persist = (next: Keymap): void => {
    setMap(next)
    void window.deskmail.shortcuts.setMap(next)
  }
  const toggleEnabled = (on: boolean): void => {
    setEnabled(on)
    void window.deskmail.shortcuts.setEnabled(on)
  }

  // While capturing, the next key press becomes the binding. Pure modifier
  // presses are ignored; Escape cancels; reserved keys are refused.
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (RESERVED_KEYS.has(e.key)) {
        showToast({ text: `“${e.key}” is reserved — pick another key.` })
        setCapturing(null)
        return
      }
      persist({ ...map, [capturing]: e.key })
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, map])

  // Keys bound to more than one action (excluding cleared ""), to warn on.
  const counts = new Map<string, number>()
  for (const s of SHORTCUTS) {
    const k = map[s.action]
    if (k) counts.set(k.toLowerCase(), (counts.get(k.toLowerCase()) ?? 0) + 1)
  }
  const isDuplicate = (k: string): boolean => !!k && (counts.get(k.toLowerCase()) ?? 0) > 1

  return (
    <div className="flex flex-col gap-5">
      <Toggle
        on={enabled}
        onChange={toggleEnabled}
        label="Keyboard shortcuts"
        hint="Single-key shortcuts for reading and triaging mail. Turn this off to disable them all."
      />

      <div className={enabled ? '' : 'pointer-events-none opacity-40'}>
        <div className="mb-2 flex items-center">
          <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Bindings</div>
          <div className="flex-1" />
          <button
            onClick={() => persist({ ...DEFAULT_KEYMAP })}
            className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:bg-raised"
          >
            Reset to defaults
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => {
            const key = map[s.action]
            const dup = isDuplicate(key)
            return (
              <div key={s.action} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-text-2">{s.label}</span>
                {dup && <span title="This key is bound to more than one action" className="flex-none text-[11px] font-semibold text-danger">duplicate</span>}
                {capturing === s.action ? (
                  <span className="flex-none rounded-md border border-accent bg-[var(--accent-soft)] px-2.5 py-1 text-[12px] font-semibold text-accent">Press a key… (Esc to cancel)</span>
                ) : (
                  <button
                    onClick={() => setCapturing(s.action)}
                    title="Rebind"
                    className="flex-none rounded-md border border-border bg-panel px-2.5 py-1 font-mono text-[12px] font-semibold text-text hover:border-accent"
                    style={dup ? { borderColor: 'var(--danger)' } : undefined}
                  >
                    {key === 'Enter' ? '↵ Enter' : key || '—'}
                  </button>
                )}
                <button
                  onClick={() => persist({ ...map, [s.action]: '' })}
                  disabled={!key}
                  title="Clear this shortcut"
                  className="flex-none rounded-md px-2 py-1 text-[12px] font-semibold text-text-3 hover:text-danger disabled:opacity-30"
                >
                  Clear
                </button>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-text-3">
          Shortcuts only fire in Mail, when you're not typing in a box and no dialog is open. Press{' '}
          <span className="font-mono">{map.help || '?'}</span> anywhere in Mail for the cheat-sheet.
        </p>
      </div>
    </div>
  )
}

export function SecurityPane(): JSX.Element {
  const [junk, setJunk] = useState<boolean | null>(null)
  const [trusted, setTrusted] = useState<{ email: string; addedAt: string }[]>([])
  useEffect(() => {
    void window.deskmail.mail.junkEnabled().then(setJunk)
    void window.deskmail.trust.list().then(setTrusted)
  }, [])

  const toggle = (): void => {
    const next = !junk
    setJunk(next)
    void window.deskmail.mail.setJunkEnabled(next)
  }
  const untrust = async (email: string): Promise<void> => {
    await window.deskmail.trust.remove(email)
    setTrusted(await window.deskmail.trust.list())
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-start gap-3 rounded-md border border-border bg-bg px-3.5 py-3">
        <input type="checkbox" checked={!!junk} onChange={toggle} className="mt-0.5 h-4 w-4 accent-accent" />
        <div>
          <div className="text-[13.5px] font-semibold">Automatically filter junk</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-3">
            Obvious spam and phishing gets moved to Junk as it arrives. It's deliberately cautious — if
            something legitimate lands there, open it and hit "Not junk" to send it back to the inbox.
          </div>
        </div>
      </label>

      {trusted.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Always load images from</div>
          <p className="mb-2 text-[12.5px] leading-relaxed text-text-3">
            Senders you've chosen "Always from this sender" for. Remove one to go back to blocking their
            remote images.
          </p>
          <div className="flex flex-col gap-1.5">
            {trusted.map((t) => (
              <div key={t.email} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text-2">{t.email}</span>
                <button onClick={() => void untrust(t.email)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">How DeskMail keeps you safe</div>
        <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-text-2">
          <li>• Email HTML is sanitised and shown in a sandbox — scripts can't run.</li>
          <li>• Remote images are blocked by default, so senders can't track you until you load them.</li>
          <li>• Your passwords are encrypted by Windows; they're never stored in plain text.</li>
          <li>• Claude can read and draft, but can't send, permanently delete, or see your passwords.</li>
        </ul>
      </div>
    </div>
  )
}

// --- Claude connector (local MCP server) --------------------------------------
// A plain-language, step-by-step explainer for people new to Claude/AI. Opens as
// its own focused window over the settings.
function ClaudeEli5({ onClose, onCopy }: { onClose: () => void; onCopy: () => void }): JSX.Element {
  const steps = [
    'On the settings screen behind this, click the “Copy” button — that copies the connection settings.',
    'Open the Claude Desktop app on this computer.',
    'In Claude Desktop, go to Settings → Developer → “Edit Config”.',
    'Paste what you copied into that file, then save it.',
    'Close Claude Desktop and open it again.'
  ]
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="max-h-[88vh] w-[min(560px,93vw)] overflow-y-auto rounded-lg border border-border bg-panel p-6 shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[17px] font-bold">Connecting Claude — the simple version</div>
          <button onClick={onClose} className="flex-none rounded-md p-1.5 text-text-2 hover:bg-raised"><Icon name="close" size={18} /></button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-text-2">
          DeskMail can team up with <b>Claude</b>, the AI assistant app on your computer. Once they're
          connected, you can ask Claude things like <i>“which emails need a reply?”</i> or <i>“draft a
          friendly reply to this one”</i> — and it helps you right here with your mail.
        </p>
        <div className="mt-3 rounded-md px-3.5 py-2.5 text-[12.5px] leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--text-2)' }}>
          <b>You stay in control.</b> Claude can read your mail and write drafts, but it can <b>never</b> send
          an email, delete anything for good, or see your password.
        </div>
        <div className="mt-4 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">What you need first</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-3">The free <b>Claude Desktop</b> app installed on this PC (from claude.ai). If you don't have it yet, install that first.</p>
        <div className="mt-4 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Then, step by step</div>
        <ol className="mt-2 flex flex-col gap-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-text-2">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[13px] leading-relaxed text-text-2">
          <b>That's it.</b> Now open Claude and ask it about your email — for example, <i>“summarise my unread emails.”</i>
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onCopy} className="rounded-md px-4 py-2 text-[13px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Copy the settings</button>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Close</button>
        </div>
      </div>
    </div>
  )
}

export function ClaudeConnectorPane(): JSX.Element {
  const [info, setInfo] = useState<{ configJson: string; tools: string[]; dbPath: string } | null>(null)
  const [eli5, setEli5] = useState(false)
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

      <button
        onClick={() => setEli5(true)}
        className="flex items-center gap-2 self-start rounded-md border px-3.5 py-2 text-[12.5px] font-semibold"
        style={{ borderColor: 'var(--claude)', color: 'var(--claude)', background: 'var(--claude-soft)' }}
      >
        <span aria-hidden>✨</span> New to Claude? Show me the simple, step-by-step guide
      </button>

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

      {eli5 && <ClaudeEli5 onClose={() => setEli5(false)} onCopy={() => { void navigator.clipboard.writeText(info.configJson); showToast({ text: 'Config copied' }) }} />}
    </div>
  )
}

// --- Meetings (informational) -------------------------------------------------
export function MeetingsPane(): JSX.Element {
  const items = [
    { t: 'Invites in your inbox', d: 'When an email contains a meeting invitation, open it and accept — the event is added to your calendar, with a one-click Join if it has a video link.' },
    { t: 'Your own events', d: 'Create events in the Calendar tab. For a video call, create the meeting in Teams/Zoom/Meet, then choose Custom link and paste the real link — or pick In person.' },
    { t: 'Joining', d: 'DeskMail recognises Teams, Google Meet and Zoom links from invites you receive and gives you a one-click Join button.' }
  ]
  return (
    <div className="flex max-w-[540px] flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">
        DeskMail has a built-in <b>calendar</b> and understands the meeting invites that arrive in your email.
      </p>
      <div className="flex flex-col gap-3.5">
        {items.map((x) => (
          <div key={x.t}>
            <div className="text-[12px] font-semibold text-accent">{x.t}</div>
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-3">{x.d}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text-3">
        <b>Coming later:</b> built-in Teams, Google Meet and Zoom integration that creates a real meeting for
        you. For now, paste your own meeting link with <b>Custom link</b>.
      </div>
    </div>
  )
}

// --- Local storage (backup / restore / portability) ---------------------------
export function LocalStoragePane(): JSX.Element {
  const [info, setInfo] = useState<{ dataDir: string; portable: boolean } | null>(null)
  const [autoDir, setAutoDir] = useState<string | null>(null)
  const [autoDays, setAutoDays] = useState(0)
  const [cacheMb, setCacheMb] = useState<number | null>(null)
  const [cacheUsed, setCacheUsed] = useState<number | null>(null)
  const showToast = useToast((s) => s.show)
  useEffect(() => {
    void window.deskmail.storage.info().then(setInfo)
    void window.deskmail.storage.autoBackupGet().then((a) => {
      setAutoDir(a.dir || null)
      setAutoDays(a.days)
    })
    void window.deskmail.storage.attachmentCacheGet().then((c) => {
      setCacheMb(c.mb)
      setCacheUsed(c.bytesUsed)
    })
  }, [])

  const saveCache = (mb: number): void => {
    const clamped = Math.max(0, Math.round(mb))
    setCacheMb(clamped)
    void window.deskmail.storage.attachmentCacheSet(clamped).then((r) => setCacheUsed(r.bytesUsed))
  }

  const backup = async (): Promise<void> => {
    const r = await window.deskmail.storage.backup()
    if (r.path) showToast({ text: 'Backup saved' })
  }
  const restore = async (): Promise<void> => {
    const r = await window.deskmail.storage.restore()
    if (r.ok) showToast({ text: 'Backup restored' })
  }

  // Persist auto-backup config immediately when the folder or interval changes.
  const saveAuto = (dir: string | null, days: number): void => {
    setAutoDir(dir)
    setAutoDays(days)
    void window.deskmail.storage.autoBackupSet(dir, days)
  }
  // Duplicate cleanup: show the count first, then confirm before deleting.
  const dedupe = async (): Promise<void> => {
    const count = await window.deskmail.storage.dedupeCount()
    if (count === 0) {
      showToast({ text: 'No duplicate messages found.' })
      return
    }
    if (!window.confirm(`Found ${count} duplicate message${count > 1 ? 's' : ''} — remove ${count > 1 ? 'them' : 'it'}? One copy of each is kept.`)) return
    const { removed } = await window.deskmail.storage.dedupe()
    showToast({ text: `Removed ${removed} duplicate${removed === 1 ? '' : 's'}.` })
  }

  const pickAutoFolder = async (): Promise<void> => {
    const r = await window.deskmail.storage.pickFolder()
    if (r.path) saveAuto(r.path, autoDays || 7)
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

      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Automatic backup</div>
        <p className="mt-1 text-[12px] leading-relaxed text-text-3">
          Keep a copy current on a USB or second drive. I'll back up on launch when it's due.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <button onClick={() => void pickAutoFolder()} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
            {autoDir ? 'Change folder' : 'Choose folder'}
          </button>
          <label className="flex items-center gap-1.5 text-[12.5px] text-text-2">
            every
            <input
              type="number"
              min={0}
              value={autoDays}
              onChange={(e) => saveAuto(autoDir, Math.max(0, Number(e.target.value)))}
              className="w-[64px] rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            days (0 = off)
          </label>
          {autoDir && autoDays > 0 && (
            <button onClick={() => saveAuto(null, 0)} className="text-[12px] font-semibold text-danger hover:underline">
              Turn off
            </button>
          )}
        </div>
        {autoDir && <div className="mt-2 break-all font-mono text-[11.5px] text-text-3">{autoDir}</div>}
      </div>

      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Attachment cache</div>
        <p className="mt-1 text-[12px] leading-relaxed text-text-3">
          Attachments you open are kept on disk so they open instantly next time. Over the cap, the
          oldest are removed — they re-download from the server whenever needed.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[12.5px] text-text-2">
          Cap at
          <input
            type="number"
            min={0}
            value={cacheMb ?? ''}
            onChange={(e) => saveCache(Number(e.target.value))}
            aria-label="Attachment cache MB"
            className="w-[80px] rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent"
          />
          MB (0 = unlimited)
          <span className="text-text-3">· currently using {((cacheUsed ?? 0) / (1024 * 1024)).toFixed(1)} MB</span>
        </div>
      </div>

      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Tidy up</div>
        <p className="mt-1 text-[12px] leading-relaxed text-text-3">
          Remove exact duplicate messages (same Message-ID in the same folder) left over from imports.
          Nothing fuzzy — one copy of each is always kept.
        </p>
        <button
          onClick={() => void dedupe()}
          className="mt-2.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
        >
          Remove duplicate messages
        </button>
      </div>
    </div>
  )
}

// --- Sending (scheduled sends) ------------------------------------------------
export function SendingPane(): JSX.Element {
  const [scheduled, setScheduled] = useState<ScheduledSend[]>([])
  const [undoSecs, setUndoSecs] = useState<number | null>(null)
  const refresh = (): void => void window.deskmail.compose.listScheduled().then(setScheduled)
  useEffect(() => {
    refresh()
    void window.deskmail.compose.undoSeconds().then(setUndoSecs)
    return window.deskmail.mail.onChanged(refresh)
  }, [])

  const cancel = async (id: number): Promise<void> => {
    await window.deskmail.compose.cancelScheduled(id)
    refresh()
  }

  const saveUndo = (n: number): void => {
    const clamped = Math.max(0, Math.min(120, Math.round(n)))
    setUndoSecs(clamped)
    void window.deskmail.compose.setUndoSeconds(clamped)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border bg-bg px-3.5 py-3">
        <div className="text-[13.5px] font-semibold">Undo send</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-3">
          How long a message waits before actually going out, so you can catch a mistake. 0 sends
          immediately with no undo.
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-text-2">
          Hold for
          <input
            type="number"
            min={0}
            max={120}
            value={undoSecs ?? ''}
            onChange={(e) => saveUndo(Number(e.target.value))}
            aria-label="Undo send seconds"
            className="w-[70px] rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent"
          />
          seconds
        </div>
      </div>
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
