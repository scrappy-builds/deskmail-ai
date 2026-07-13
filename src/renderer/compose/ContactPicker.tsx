import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import type { Contact } from '@shared/db'

// Outlook-style address book for compose: search your contacts, tick the ones you
// want, and drop them into To / Cc / Bcc — no typing addresses by hand. Stays open
// after adding so you can build all three fields in one go.
export function ContactPicker({
  contacts,
  onAdd,
  onClose
}: {
  contacts: Contact[]
  onAdd: (field: 'to' | 'cc' | 'bcc', emails: string[]) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set()) // by email (lowercased)
  const [note, setNote] = useState<string | null>(null)

  // Only contacts with an address are selectable; sorted by name for scanning.
  const withEmail = useMemo(
    () =>
      contacts
        .filter((c) => c.email)
        .sort((a, b) => (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '')),
    [contacts]
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return withEmail
    return withEmail.filter((c) => (c.name ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
  }, [withEmail, query])

  const toggle = (email: string): void =>
    setPicked((s) => {
      const key = email.toLowerCase()
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const add = (field: 'to' | 'cc' | 'bcc'): void => {
    // Preserve the original-case addresses for the picked keys.
    const emails = withEmail.filter((c) => c.email && picked.has(c.email.toLowerCase())).map((c) => c.email as string)
    if (emails.length === 0) return
    onAdd(field, emails)
    setPicked(new Set())
    setNote(`Added ${emails.length} to ${field === 'to' ? 'To' : field === 'cc' ? 'Cc' : 'Bcc'}`)
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div data-testid="contact-picker" className="flex max-h-[80vh] w-[min(520px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center gap-2 border-b border-border px-5 py-3.5">
          <Icon name="contacts" size={17} className="text-text-2" />
          <div className="text-[15px] font-bold">Add from contacts</div>
          <div className="flex-1" />
          <button onClick={onClose} className="flex rounded-md p-1.5 text-text-2 hover:bg-raised" title="Close">
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="flex-none px-4 pt-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search contacts"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {withEmail.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-text-3">No contacts with an email address yet. Add contacts in Settings → Contacts.</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-text-3">No matches.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {shown.map((c) => {
                const on = c.email ? picked.has(c.email.toLowerCase()) : false
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-hover">
                    <input type="checkbox" checked={on} onChange={() => c.email && toggle(c.email)} className="h-4 w-4 flex-none accent-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{c.name ?? c.email}</span>
                      {c.name && <span className="block truncate text-[11.5px] text-text-3">{c.email}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-[12px] text-text-3">{picked.size > 0 ? `${picked.size} selected` : note ?? 'Tick contacts, then add them to a field'}</span>
          <div className="flex-1" />
          <button onClick={() => add('to')} disabled={picked.size === 0} className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-bold text-accent-fg hover:bg-accent-2 disabled:opacity-40">To</button>
          <button onClick={() => add('cc')} disabled={picked.size === 0} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised disabled:opacity-40">Cc</button>
          <button onClick={() => add('bcc')} disabled={picked.size === 0} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised disabled:opacity-40">Bcc</button>
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised">Done</button>
        </div>
      </div>
    </div>
  )
}
