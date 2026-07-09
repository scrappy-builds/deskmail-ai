import { useState } from 'react'
import { Icon } from '../Icon'
import type { MessageListItem } from '@shared/db'
import { fmtTime, initials } from '../mail/format'
import { useMail } from '../store/mailStore'
import { useLayout } from '../store/layoutStore'
import { planBulk, runBulk, type BulkOp } from '../mail/bulkOps'
import { useToast } from '../store/toastStore'

interface MessageListProps {
  rowPaddingY: number
  previewLineCount: number
  showSnippet: boolean
  showAvatars: boolean
  onOpen?: (id: number) => void
}

const AVATAR = { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }

function Row({
  m,
  selected,
  checked,
  onToggleCheck,
  onSelect,
  onOpen,
  rowPaddingY,
  clamp,
  showSnippet,
  showAvatars
}: {
  m: MessageListItem
  selected: boolean
  checked: boolean
  onToggleCheck: () => void
  onSelect: () => void
  onOpen: () => void
  rowPaddingY: number
  clamp: number
  showSnippet: boolean
  showAvatars: boolean
}): JSX.Element {
  const weight = m.isRead ? 500 : 700
  const name = m.fromName || m.fromEmail || 'Unknown sender'
  return (
    <div
      data-testid={`msg-row-${m.id}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className="flex cursor-pointer gap-2.5 border-b border-border hover:bg-hover"
      style={{
        padding: `${rowPaddingY}px 14px ${rowPaddingY}px 11px`,
        background: selected ? 'var(--accent-soft)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        opacity: m.isMuted ? 0.55 : 1
      }}
    >
      <div className="flex flex-none items-start pt-[14px]">
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleCheck}
          title="Select"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
      </div>
      <div className="flex w-[7px] flex-none justify-center pt-[15px]">
        {!m.isRead && <span className="block h-[7px] w-[7px] rounded-full bg-accent" />}
      </div>
      {showAvatars && (
        <div
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-bold"
          style={{ background: AVATAR.bg, color: AVATAR.fg }}
        >
          {initials(m.fromName || m.fromEmail)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px]">
          <span className="flex-1 truncate text-[13.5px] text-text" style={{ fontWeight: weight }}>
            {name}
          </span>
          {m.isPinned && <Icon name="pin" size={14} className="text-accent" />}
          {m.hasAttachments && <Icon name="clip" size={14} className="text-text-3" />}
          {m.isStarred && <Icon name="star" size={14} className="text-star" fill />}
          <span className="flex-none whitespace-nowrap text-[11.5px] text-text-3">{fmtTime(m.receivedAt)}</span>
        </div>
        <div className="mt-px truncate text-[13px] text-text" style={{ fontWeight: weight }}>
          {m.subject || '(no subject)'}
        </div>
        {showSnippet && m.snippet && (
          <div
            className="mt-0.5 overflow-hidden text-[12.5px] leading-[1.45] text-text-2"
            style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: clamp }}
          >
            {m.snippet}
          </div>
        )}
      </div>
    </div>
  )
}

export function MessageList({ rowPaddingY, previewLineCount, showSnippet, showAvatars, onOpen }: MessageListProps): JSX.Element {
  const { folders, labels, smartViews, messages, activeFolderId, activeLabelId, activeSmartViewId, selectedId, select, searchQuery } = useMail()
  const selectedIds = useMail((s) => s.selectedIds)
  const toggleSelected = useMail((s) => s.toggleSelected)
  const clearSelected = useMail((s) => s.clearSelected)
  const selectAll = useMail((s) => s.selectAll)
  const refresh = useMail((s) => s.refresh)
  const showToast = useToast((s) => s.show)
  const [moveOpen, setMoveOpen] = useState(false)
  const openInFullWindow = useLayout((s) => s.prefs.openEmailBehaviour === 'full-window')
  const searching = searchQuery.trim().length > 0
  const allSelected = messages.length > 0 && selectedIds.size === messages.length

  const doBulk = async (op: BulkOp, targetFolderId?: number): Promise<void> => {
    const steps = planBulk(op, selectedIds, targetFolderId)
    if (steps.length === 0) return
    await runBulk(steps)
    setMoveOpen(false)
    clearSelected()
    await refresh()
    showToast({ text: `${steps.length} message${steps.length > 1 ? 's' : ''} updated` })
  }
  // Every folder except drafts — targets for a bulk move.
  const moveTargets = folders.filter((f) => f.role !== 'drafts' && f.id !== activeFolderId)
  const activeLabel = labels.find((l) => l.id === activeLabelId)
  const activeSmart = smartViews.find((v) => v.id === activeSmartViewId)
  const title = searching
    ? `Search: ${searchQuery}`
    : activeSmart
      ? activeSmart.name
      : activeLabel
        ? activeLabel.name
        : folders.find((f) => f.id === activeFolderId)?.name ?? 'Inbox'

  const handleSelect = (msgId: number): void => {
    void select(msgId)
    if (openInFullWindow) onOpen?.(msgId)
  }

  return (
    <>
      <div className="flex h-12 flex-none items-center gap-2.5 border-b border-border px-3.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] font-semibold text-text-3">{messages.length}</span>
        <div className="flex-1" />
        <button className="flex cursor-pointer rounded-md p-1.5 text-text-2 hover:bg-raised" title="Filter">
          <Icon name="filter" size={18} />
        </button>
        <button
          onClick={() => (allSelected ? clearSelected() : selectAll(messages.map((m) => m.id)))}
          className="flex cursor-pointer rounded-md p-1.5 hover:bg-raised"
          style={{ color: allSelected ? 'var(--accent)' : 'var(--text-2)' }}
          title={allSelected ? 'Clear selection' : 'Select all'}
        >
          <Icon name="check" size={18} />
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="relative flex flex-none items-center gap-1 border-b border-border bg-panel px-3 py-2">
          <span className="mr-1 text-[12.5px] font-semibold text-text-2">{selectedIds.size} selected</span>
          <button onClick={() => void doBulk('read')} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised">Mark read</button>
          <button onClick={() => void doBulk('unread')} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised">Mark unread</button>
          <button onClick={() => void doBulk('delete')} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-danger hover:bg-raised">Delete</button>
          <button onClick={() => setMoveOpen((v) => !v)} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised">Move to…</button>
          <div className="flex-1" />
          <button onClick={clearSelected} className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-text-3 hover:bg-raised">Clear</button>
          {moveOpen && (
            <div className="absolute left-3 top-full z-20 mt-1 max-h-[300px] w-[200px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
              <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Move to…</div>
              {moveTargets.length === 0 ? (
                <div className="px-2.5 py-1.5 text-[12px] text-text-3">No other folders.</div>
              ) : (
                moveTargets.map((f) => (
                  <button key={f.id} onClick={() => void doBulk('move', f.id)} className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                    {f.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {messages.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[14px] font-bold text-text-2">
              {searching ? `No messages match "${searchQuery}"` : 'Nothing here yet'}
            </div>
            <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] text-text-3">
              {searching
                ? 'Try a different term, or clear the search to go back to the folder.'
                : "When your mail syncs it'll show up here. Add an account in Settings if you haven't yet."}
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <Row
              key={m.id}
              m={m}
              selected={m.id === selectedId}
              checked={selectedIds.has(m.id)}
              onToggleCheck={() => toggleSelected(m.id)}
              onSelect={() => handleSelect(m.id)}
              onOpen={() => onOpen?.(m.id)}
              rowPaddingY={rowPaddingY}
              clamp={Math.max(1, previewLineCount)}
              showSnippet={showSnippet}
              showAvatars={showAvatars}
            />
          ))
        )}
      </div>
    </>
  )
}
