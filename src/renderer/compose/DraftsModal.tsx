import { useEffect, useState } from 'react'
import type { DraftSummary } from '@shared/db'
import { fmtTime } from '../mail/format'
import { sanitiseEmail } from '../mail/sanitise'
import { PanePlaceholder, PaneRow, TwoPaneFolder } from './TwoPaneFolder'

const claudeBadge = (
  <span className="flex-none rounded-sm px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--claude-soft)', color: 'var(--claude)' }}>
    CLAUDE
  </span>
)

// Drafts shown inline in the main area as a folder-style list + preview, like any
// other folder — no pop-up. Includes any draft Claude created via the MCP
// connector (carries a badge); this is where create_draft becomes visible.
export function DraftsView(): JSX.Element {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const refresh = async (): Promise<void> => {
    setDrafts(await window.deskmail.compose.listDrafts())
  }
  useEffect(() => {
    void refresh()
  }, [])

  const remove = async (id: number): Promise<void> => {
    await window.deskmail.compose.deleteDraft(id)
    setSelectedId((cur) => (cur === id ? null : cur))
    void refresh()
  }

  const list = drafts ?? []
  const selected = list.find((d) => d.id === selectedId) ?? null

  const empty = (
    <div className="px-2 text-center">
      <div className="text-[14px] font-bold text-text-2">Nothing here yet</div>
      <p className="mx-auto mt-1.5 max-w-[320px] text-[12.5px] text-text-3">
        Drafts you save — and any Claude writes for you through the connector — show up here for you to
        review and send.
      </p>
    </div>
  )

  const rows = list.map((d) => (
    <PaneRow
      key={d.id}
      selected={d.id === selectedId}
      onClick={() => setSelectedId(d.id)}
      onDoubleClick={() => window.deskmail.openCompose(d.id)}
      title={d.subject || '(no subject)'}
      badge={d.createdBy === 'claude' ? claudeBadge : undefined}
      sub={`To ${d.to.join(', ') || '—'} · ${fmtTime(d.updatedAt)}`}
    />
  ))

  const preview = selected ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-start gap-2.5 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-bold">{selected.subject || '(no subject)'}</span>
            {selected.createdBy === 'claude' && claudeBadge}
          </div>
          <div className="mt-1 text-[12.5px] text-text-3">To {selected.to.join(', ') || '—'}</div>
          {selected.cc.length > 0 && <div className="text-[12.5px] text-text-3">Cc {selected.cc.join(', ')}</div>}
          <div className="mt-0.5 text-[12px] text-text-3">Last edited {fmtTime(selected.updatedAt)}</div>
        </div>
        <button onClick={() => window.deskmail.openCompose(selected.id)} className="flex-none rounded-md bg-accent px-3.5 py-2 text-[13px] font-bold text-accent-fg hover:bg-accent-2">
          Edit
        </button>
        <button onClick={() => void remove(selected.id)} className="flex-none rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-danger hover:bg-raised">
          Delete
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-[1.6]"
        dangerouslySetInnerHTML={{ __html: sanitiseEmail(selected.bodyHtml ?? '').html || '<p style="color:var(--text-3)">No message written yet.</p>' }}
      />
      {selected.attachments.length > 0 && (
        <div className="flex flex-none flex-wrap gap-2 border-t border-border px-5 py-3">
          {selected.attachments.map((a, i) => (
            <span key={i} className="rounded-md border border-border bg-panel px-2.5 py-1 text-[12px] text-text-2">{a.name}</span>
          ))}
        </div>
      )}
    </div>
  ) : (
    <PanePlaceholder text="Pick a draft on the left to preview it. Double-click to open it for editing." />
  )

  return <TwoPaneFolder testId="drafts-view" title="Drafts" count={list.length} loading={drafts === null} empty={empty} rows={rows} preview={preview} />
}
