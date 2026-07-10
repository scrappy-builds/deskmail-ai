import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { AttachmentBrowserItem } from '@shared/db'
import { fmtTime } from './format'
import { useToast } from '../store/toastStore'

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PAGE = 100

// One searchable view of every attachment in the mailbox — built for
// invoice-hunting. Open downloads on demand; "Show message" pops the message
// out in its own window.
export function AttachmentsBrowser({ onClose }: { onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<AttachmentBrowserItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const showToast = useToast((s) => s.show)

  useEffect(() => {
    const t = setTimeout(() => {
      void window.deskmail.attachments.browse(query || undefined, offset).then(setItems)
    }, 150) // debounce typing
    return () => clearTimeout(t)
  }, [query, offset])

  const open = async (it: AttachmentBrowserItem): Promise<void> => {
    const r = await window.deskmail.attachments.open(it.messageId, it.attachmentId)
    if (!r.ok) showToast({ text: r.error ?? "Couldn't open the attachment" })
  }

  return (
    <div className="absolute inset-0 z-[64] flex items-center justify-center" style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div data-testid="attachments-browser" className="flex max-h-[84vh] w-[min(760px,94vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center gap-3 border-b border-border px-5 py-4">
          <div className="text-[16px] font-bold">All attachments</div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOffset(0)
            }}
            placeholder="Search by filename or sender"
            aria-label="Search attachments"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-[13px] outline-none focus:border-accent"
          />
          <button onClick={onClose} className="flex rounded-md p-2 text-text-2 hover:bg-raised">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <p className="px-2 py-6 text-center text-[13px] text-text-3">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-10 text-center text-[13px] text-text-3">
              {query ? `Nothing matching “${query}”.` : 'No attachments in the mailbox yet.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((it) => (
                <div key={it.attachmentId} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-2.5">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-sm bg-accent text-[8px] font-extrabold uppercase text-white">
                    {(it.filename?.split('.').pop() ?? 'file').slice(0, 4)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{it.filename ?? 'attachment'}</div>
                    <div className="truncate text-[12px] text-text-3">
                      {it.fromName || it.fromEmail || '—'} · {it.subject || '(no subject)'} · {fmtTime(it.receivedAt ?? '')}
                      {it.size ? ` · ${fmtSize(it.size)}` : ''}
                    </div>
                  </div>
                  <button onClick={() => void open(it)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Open</button>
                  <button onClick={() => window.deskmail.openMessage(it.messageId)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:underline">
                    Show message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {(offset > 0 || (items?.length ?? 0) === PAGE) && (
          <div className="flex flex-none items-center justify-between border-t border-border px-5 py-2.5 text-[12.5px]">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="font-semibold text-accent disabled:opacity-40">
              ← Newer
            </button>
            <button disabled={(items?.length ?? 0) < PAGE} onClick={() => setOffset(offset + PAGE)} className="font-semibold text-accent disabled:opacity-40">
              Older →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
