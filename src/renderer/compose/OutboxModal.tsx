import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { ScheduledSend } from '@shared/db'
import { fmtTime } from '../mail/format'

// The Outbox shown inline in the main area, like any other folder — no pop-up.
// Mail waiting to go out: the brief undo-send window plus anything scheduled with
// "Send later". Cancelling returns it to a draft (send is halted).
export function OutboxView(): JSX.Element {
  const [items, setItems] = useState<ScheduledSend[] | null>(null)

  const refresh = async (): Promise<void> => {
    setItems(await window.deskmail.compose.listScheduled())
  }
  useEffect(() => {
    void refresh()
  }, [])

  const cancel = async (id: number): Promise<void> => {
    await window.deskmail.compose.cancelScheduled(id)
    void refresh()
  }
  const retry = async (id: number): Promise<void> => {
    await window.deskmail.compose.retryScheduled(id)
    void refresh()
  }

  // One status line per row: failed loudly, mid-backoff, or simply queued.
  const statusLine = (s: ScheduledSend): string => {
    if (s.status === 'error') return `Failed after ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}${s.lastError ? ` — ${s.lastError}` : ''}`
    if (s.attempts > 0 && s.nextAttemptAt) return `Attempt ${s.attempts} failed — retrying ${fmtTime(s.nextAttemptAt)}`
    return `sends ${fmtTime(s.sendAt)}`
  }

  return (
    <div data-testid="outbox-view" className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex flex-none items-center border-b border-border px-5 py-3">
        <div className="text-[15px] font-bold">Outbox</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {items === null ? (
          <p className="px-2 py-6 text-center text-[13px] text-text-3">Loading…</p>
        ) : items.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <div className="text-[14px] font-bold text-text-2">Nothing here yet</div>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[12.5px] text-text-3">
              Mail waiting to send shows here — during the few seconds you can undo a send, or until a
              scheduled "Send later" is due. Cancelling here stops the send and keeps it as a draft.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-1.5">
            {items.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-md border border-border bg-panel px-3.5 py-2.5">
                <span className="flex flex-none" style={{ color: s.status === 'error' ? 'var(--danger)' : 'var(--text-3)' }}>
                  <Icon name="clock" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{s.subject || '(no subject)'}</div>
                  <div className="truncate text-[12px]" style={{ color: s.status === 'error' ? 'var(--danger)' : 'var(--text-3)' }}>
                    To {s.to.join(', ') || '—'} · {statusLine(s)}
                  </div>
                </div>
                {s.status === 'error' && (
                  <button onClick={() => void retry(s.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">
                    Retry now
                  </button>
                )}
                <button onClick={() => void cancel(s.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
