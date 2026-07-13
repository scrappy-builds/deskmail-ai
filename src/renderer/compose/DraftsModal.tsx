import { useEffect, useState } from 'react'
import type { DraftSummary } from '@shared/db'
import { fmtTime } from '../mail/format'

// Drafts shown inline in the main area, like any other folder — no pop-up.
// Includes any Claude created via the MCP connector, which carry a badge; this is
// where create_draft becomes visible to the user.
export function DraftsView(): JSX.Element {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)

  const refresh = async (): Promise<void> => {
    setDrafts(await window.deskmail.compose.listDrafts())
  }
  useEffect(() => {
    void refresh()
  }, [])

  const remove = async (id: number): Promise<void> => {
    await window.deskmail.compose.deleteDraft(id)
    void refresh()
  }

  return (
    <div data-testid="drafts-view" className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex flex-none items-center border-b border-border px-5 py-3">
        <div className="text-[15px] font-bold">Drafts</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {drafts === null ? (
          <p className="px-2 py-6 text-center text-[13px] text-text-3">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <div className="text-[14px] font-bold text-text-2">Nothing here yet</div>
            <p className="mx-auto mt-1.5 max-w-[320px] text-[12.5px] text-text-3">
              Drafts you save — and any Claude writes for you through the connector — show up here for
              you to review and send.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-1.5">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-md border border-border bg-panel px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{d.subject || '(no subject)'}</span>
                    {d.createdBy === 'claude' && (
                      <span className="flex-none rounded-sm px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--claude-soft)', color: 'var(--claude)' }}>
                        CLAUDE
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-text-3">To {d.to.join(', ') || '—'} · {fmtTime(d.updatedAt)}</div>
                </div>
                <button onClick={() => window.deskmail.openCompose(d.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Edit</button>
                <button onClick={() => void remove(d.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
