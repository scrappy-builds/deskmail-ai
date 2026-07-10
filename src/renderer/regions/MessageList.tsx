import { useState } from 'react'
import { Icon } from '../Icon'
import type { MessageListItem } from '@shared/db'
import { fmtTime, initials, messageDateGroup } from '../mail/format'
import { sortMessages, SORT_LABELS, type SortField } from '../mail/sortMessages'
import { MSG_DND_TYPE } from '../mail/dnd'
import { useMail } from '../store/mailStore'
import { useLayout } from '../store/layoutStore'

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
  onDragStart,
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
  onDragStart: (e: React.DragEvent) => void
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
      draggable
      onDragStart={onDragStart}
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
          {m.importance === 'high' && <span title="High importance" className="flex-none text-[13px] font-extrabold text-danger">!</span>}
          {m.importance === 'low' && <Icon name="chevronDown" size={13} className="text-text-3" />}
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
  const openInFullWindow = useLayout((s) => s.prefs.openEmailBehaviour === 'full-window')
  const searching = searchQuery.trim().length > 0
  const allSelected = messages.length > 0 && selectedIds.size === messages.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const sort = useMail((s) => s.sort)
  const setSortAndSave = useMail((s) => s.setSort)
  const [sortOpen, setSortOpen] = useState(false)
  const sorted = sortMessages(messages, sort.field, sort.dir)
  const showDateGroups = sort.field === 'date'

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

  // Dragging a row carries its id — or every ticked id if the row is part of a
  // multi-selection — so it can be dropped on a sidebar folder to move it.
  const startDrag = (e: React.DragEvent, msgId: number): void => {
    const ids = selectedIds.has(msgId) && selectedIds.size > 0 ? [...selectedIds] : [msgId]
    e.dataTransfer.setData(MSG_DND_TYPE, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      <div className="flex h-12 flex-none items-center gap-2.5 border-b border-border px-3.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] font-semibold text-text-3">{messages.length}</span>
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setSortOpen((v) => !v)} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised" title="Sort messages">
            <Icon name="filter" size={16} />
            <span>{SORT_LABELS[sort.field]}</span>
            <Icon name={sort.dir === 'asc' ? 'chevronDown' : 'chevronDown'} size={12} className={sort.dir === 'asc' ? 'rotate-180 opacity-60' : 'opacity-60'} />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
                <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Sort by</div>
                {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
                  <button key={f} onClick={() => { setSortAndSave({ field: f, dir: sort.dir }); setSortOpen(false) }} className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                    {SORT_LABELS[f]} {sort.field === f && <Icon name="check" size={14} className="text-accent" />}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button onClick={() => setSortAndSave({ field: sort.field, dir: sort.dir === 'asc' ? 'desc' : 'asc' })} className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                  {sort.dir === 'asc' ? 'Ascending' : 'Descending'} <Icon name="chevronDown" size={13} className={sort.dir === 'asc' ? 'rotate-180' : ''} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Select-all tickbox at the head of the checkbox column — aligns under each
          row's checkbox (row uses 11px left padding + 2.5 gap). Indeterminate when
          some-but-not-all are ticked. */}
      {messages.length > 0 && (
        <label className="flex h-8 flex-none cursor-pointer items-center gap-2.5 border-b border-border pl-[11px] pr-3.5 hover:bg-hover">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected }}
            onChange={() => (selectedIds.size > 0 ? clearSelected() : selectAll(messages.map((m) => m.id)))}
            title={allSelected ? 'Clear selection' : 'Select all'}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="select-none text-[12px] font-semibold text-text-3">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </label>
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
          (() => {
            // Interleave "Today / Yesterday / This week / …" separators as the
            // date bucket changes down the list (pinned mail groups under "Pinned").
            let lastGroup = ''
            const out: JSX.Element[] = []
            for (const m of sorted) {
              const group = m.isPinned ? 'Pinned' : messageDateGroup(m.receivedAt)
              if (showDateGroups && group !== lastGroup) {
                lastGroup = group
                out.push(
                  <div key={`grp-${group}-${m.id}`} className="sticky top-0 z-[1] border-b border-border bg-panel px-3.5 py-1 text-[11px] font-bold uppercase tracking-[.5px] text-text-3">
                    {group}
                  </div>
                )
              }
              out.push(
                <Row
                  key={m.id}
                  m={m}
                  selected={m.id === selectedId}
                  checked={selectedIds.has(m.id)}
                  onToggleCheck={() => toggleSelected(m.id)}
                  onSelect={() => handleSelect(m.id)}
                  onOpen={() => onOpen?.(m.id)}
                  onDragStart={(e) => startDrag(e, m.id)}
                  rowPaddingY={rowPaddingY}
                  clamp={Math.max(1, previewLineCount)}
                  showSnippet={showSnippet}
                  showAvatars={showAvatars}
                />
              )
            }
            return out
          })()
        )}
      </div>
    </>
  )
}
