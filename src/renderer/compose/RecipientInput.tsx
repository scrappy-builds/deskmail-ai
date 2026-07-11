import { useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { Contact } from '@shared/db'

// Split typed/pasted text into recipient tokens ("a@b.com, c@d.com" → two).
export function tokenise(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Merge new tokens into the list, case-insensitively deduped, order kept.
export function addRecipients(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((v) => v.toLowerCase()))
  const out = [...current]
  for (const t of incoming) {
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

// To/Cc/Bcc field: accepted recipients render as removable chips; typing ≥2
// characters offers matching contacts (name + address) with arrow-key
// navigation. Replaces the bare native <datalist>.
export function RecipientInput({
  value,
  onChange,
  contacts,
  ariaLabel,
  placeholder
}: {
  value: string[]
  onChange: (v: string[]) => void
  contacts: Contact[]
  ariaLabel: string
  placeholder?: string
}): JSX.Element {
  const [text, setText] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (q.length < 2) return []
    const have = new Set(value.map((v) => v.toLowerCase()))
    return contacts
      .filter((c) => c.email && !have.has(c.email.toLowerCase()))
      .filter((c) => (c.name ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [text, contacts, value])

  const commit = (tokens: string[]): void => {
    const next = addRecipients(value, tokens)
    if (next.length !== value.length) onChange(next)
    setText('')
    setHighlight(0)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault()
      setHighlight((h) => (h + 1) % matches.length)
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault()
      setHighlight((h) => (h - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || (e.key === 'Tab' && (text.trim() || matches.length))) {
      const pick = matches[highlight]
      if (pick?.email && matches.length) {
        e.preventDefault()
        commit([pick.email])
      } else if (text.trim()) {
        e.preventDefault()
        commit(tokenise(text))
      }
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault()
      if (text.trim()) commit(tokenise(text))
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Escape') {
      setText(text) // keep text; just drop the menu by clearing matches via blur below
      setHighlight(0)
    }
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5" onClick={() => inputRef.current?.focus()}>
      {value.map((r, i) => (
        <span key={`${r}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-raised px-2 py-0.5 text-[12px] font-semibold text-text-2">
          {r}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onChange(value.filter((_, j) => j !== i))
            }}
            title={`Remove ${r}`}
            className="opacity-70 hover:opacity-100"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',') || v.includes(';')) commit(tokenise(v)) // paste with separators
          else setText(v)
          setHighlight(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (text.trim()) commit(tokenise(text)) // whatever's typed becomes a chip
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-label={ariaLabel}
        className="min-w-[120px] flex-1 border-none bg-transparent py-0.5 text-[13.5px] text-text outline-none"
      />
      {matches.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(340px,90%)] overflow-hidden rounded-lg border border-border-2 bg-panel py-1 shadow-raised">
          {matches.map((c, i) => (
            <button
              key={c.id}
              // mousedown so the input doesn't blur before the click lands
              onMouseDown={(e) => {
                e.preventDefault()
                if (c.email) commit([c.email])
              }}
              onMouseEnter={() => setHighlight(i)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
              style={i === highlight ? { background: 'var(--accent-soft)' } : undefined}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{c.name ?? c.email}</span>
                {c.name && <span className="block truncate text-[11.5px] text-text-3">{c.email}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
