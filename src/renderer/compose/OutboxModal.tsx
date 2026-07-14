import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { ScheduledSend } from '@shared/db'
import { fmtTime } from '../mail/format'
import { sanitiseEmail } from '../mail/sanitise'
import { PanePlaceholder, PaneRow, TwoPaneFolder } from './TwoPaneFolder'

// The Outbox shown inline in the main area as a folder-style list + preview, like
// any other folder — no pop-up. Mail waiting to go out: the brief undo-send window
// plus anything scheduled with "Send later". Cancelling returns it to a draft.
export function OutboxView(): JSX.Element {
  const [items, setItems] = useState<ScheduledSend[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const refresh = async (): Promise<void> => {
    setItems(await window.deskmail.compose.listScheduled())
  }
  useEffect(() => {
    void refresh()
  }, [])

  const cancel = async (id: number): Promise<void> => {
    await window.deskmail.compose.cancelScheduled(id)
    setSelectedId((cur) => (cur === id ? null : cur))
    void refresh()
  }
  const retry = async (id: number): Promise<void> => {
    await window.deskmail.compose.retryScheduled(id)
    void refresh()
  }

  // One status line per item: failed loudly, mid-backoff, or simply queued.
  const statusLine = (s: ScheduledSend): string => {
    if (s.status === 'error') return `Failed after ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}${s.lastError ? ` — ${s.lastError}` : ''}`
    if (s.attempts > 0 && s.nextAttemptAt) return `Attempt ${s.attempts} failed — retrying ${fmtTime(s.nextAttemptAt)}`
    return `Sends ${fmtTime(s.sendAt)}`
  }

  const list = items ?? []
  const selected = list.find((s) => s.id === selectedId) ?? null

  const empty = (
    <div className="px-2 text-center">
      <div className="text-[14px] font-bold text-text-2">Nothing here yet</div>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[12.5px] text-text-3">
        Mail waiting to send shows here — during the few seconds you can undo a send, or until a scheduled
        "Send later" is due. Cancelling here stops the send and keeps it as a draft.
      </p>
    </div>
  )

  const rows = list.map((s) => (
    <PaneRow
      key={s.id}
      selected={s.id === selectedId}
      onClick={() => setSelectedId(s.id)}
      icon={<Icon name="clock" size={16} className={s.status === 'error' ? 'text-danger' : 'text-text-3'} />}
      title={s.subject || '(no subject)'}
      danger={s.status === 'error'}
      sub={`To ${s.to.join(', ') || '—'} · ${statusLine(s)}`}
    />
  ))

  const preview = selected ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-start gap-2.5 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{selected.subject || '(no subject)'}</div>
          <div className="mt-1 text-[12.5px] text-text-3">To {selected.to.join(', ') || '—'}</div>
          {selected.cc.length > 0 && <div className="text-[12.5px] text-text-3">Cc {selected.cc.join(', ')}</div>}
        </div>
        {selected.status === 'error' && (
          <button onClick={() => void retry(selected.id)} className="flex-none rounded-md bg-accent px-3.5 py-2 text-[13px] font-bold text-accent-fg hover:bg-accent-2">
            Retry now
          </button>
        )}
        <button onClick={() => void cancel(selected.id)} className="flex-none rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-danger hover:bg-raised">
          Cancel
        </button>
      </div>
      <div className="flex flex-none items-center gap-2 border-b border-border px-5 py-2.5 text-[13px]" style={{ color: selected.status === 'error' ? 'var(--danger)' : 'var(--text-2)' }}>
        <Icon name="clock" size={15} className="flex-none" />
        <span>{statusLine(selected)}</span>
      </div>
      <div
        className="flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-[1.6]"
        dangerouslySetInnerHTML={{ __html: sanitiseEmail(selected.bodyHtml ?? '').html || '<p style="color:var(--text-3)">No message body.</p>' }}
      />
    </div>
  ) : (
    <PanePlaceholder text="Pick an item on the left to see where it is in the send queue." />
  )

  return <TwoPaneFolder testId="outbox-view" title="Outbox" count={list.length} loading={items === null} empty={empty} rows={rows} preview={preview} />
}
