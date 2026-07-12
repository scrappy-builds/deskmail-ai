import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { MessageListItem } from '@shared/db'
import { fmtTime, initials, messageDateGroup } from '../mail/format'
import { sortMessages, SORT_LABELS, type SortField } from '../mail/sortMessages'
import { groupThreads } from '../mail/threads'
import { MSG_DND_TYPE } from '../mail/dnd'
import { visibleRange } from './useWindowedList'
import { MessageContextMenu } from './MessageContextMenu'
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
  onContextMenu,
  onDragStart,
  rowPaddingY,
  clamp,
  showSnippet,
  showAvatars,
  threadCount,
  threadExpanded,
  onToggleThread,
  indent
}: {
  m: MessageListItem
  selected: boolean
  checked: boolean
  onToggleCheck: () => void
  onSelect: () => void
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  rowPaddingY: number
  clamp: number
  showSnippet: boolean
  showAvatars: boolean
  threadCount?: number
  threadExpanded?: boolean
  onToggleThread?: () => void
  indent?: boolean
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
      onContextMenu={onContextMenu}
      className="flex cursor-pointer gap-2.5 border-b border-border hover:bg-hover"
      style={{
        padding: `${rowPaddingY}px 14px ${rowPaddingY}px ${indent ? 30 : 11}px`,
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
          {threadCount != null && threadCount > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleThread?.() }}
              title={threadExpanded ? 'Collapse thread' : 'Expand thread'}
              className="flex flex-none items-center gap-0.5 rounded-full bg-[var(--accent-soft)] px-1.5 text-[11px] font-bold text-accent"
            >
              {threadCount}
              <Icon name="chevronDown" size={11} className={threadExpanded ? '' : '-rotate-90'} />
            </button>
          )}
          {m.importance === 'high' && <span title="High importance" className="flex-none text-[13px] font-extrabold text-danger">!</span>}
          {m.importance === 'low' && <Icon name="chevronDown" size={13} className="text-text-3" />}
          {m.followupAt && <Icon name="clock" size={13} className="text-accent" />}
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
  const { folders, labels, smartViews, messages, activeFolderId, activeLabelId, activeSmartViewId, activeUnified, selectedId, select, searchQuery } = useMail()
  const selectedIds = useMail((s) => s.selectedIds)
  const toggleSelected = useMail((s) => s.toggleSelected)
  const clearSelected = useMail((s) => s.clearSelected)
  const selectAll = useMail((s) => s.selectAll)
  const openInFullWindow = useLayout((s) => s.prefs.openEmailBehaviour === 'full-window')
  const listStyle = useLayout((s) => s.prefs.messageListStyle)
  const searching = searchQuery.trim().length > 0
  const allSelected = messages.length > 0 && selectedIds.size === messages.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const sort = useMail((s) => s.sort)
  const setSortAndSave = useMail((s) => s.setSort)
  const [sortOpen, setSortOpen] = useState(false)

  // Focused/Other tabs — inbox and unified inbox only, when the feature is on.
  const [focusedEnabled, setFocusedEnabled] = useState(false)
  const [focusTab, setFocusTab] = useState<'focused' | 'other'>('focused')
  useEffect(() => {
    void window.deskmail.mail.focusedEnabled().then(setFocusedEnabled)
  }, [])
  const inInbox = activeUnified || folders.find((f) => f.id === activeFolderId)?.role === 'inbox'
  const focusTabsOn = focusedEnabled && inInbox && !searching
  const threading = useMail((s) => s.threading)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const toggleThread = (key: string): void => setExpandedThreads((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const visibleMessages = focusTabsOn ? messages.filter((m) => m.isFocused === (focusTab === 'focused')) : messages
  const sorted = sortMessages(visibleMessages, sort.field, sort.dir)
  const showDateGroups = sort.field === 'date' && !threading
  const otherUnread = focusTabsOn ? messages.filter((m) => !m.isFocused && !m.isRead).length : 0
  const focusedUnread = focusTabsOn ? messages.filter((m) => m.isFocused && !m.isRead).length : 0

  // --- Windowing: only the visible rows exist in the DOM ---------------------
  const HEADER_H = 25
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [rowH, setRowH] = useState<number | null>(null)
  // Density/preview changes alter the real row height — re-measure.
  useEffect(() => setRowH(null), [rowPaddingY, showSnippet, previewLineCount, showAvatars])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Measure one real row once per config; the estimate below covers first paint.
  useLayoutEffect(() => {
    if (rowH != null) return
    const el = scrollRef.current?.querySelector('[data-testid^="msg-row-"]') as HTMLElement | null
    if (el && el.offsetHeight > 0) setRowH(el.offsetHeight)
  })
  const rowHeight = rowH ?? rowPaddingY * 2 + 42 + (showSnippet ? Math.max(1, previewLineCount) * 18 : 0)
  // Keep the selected row visible when selection changes (keyboard/next-prev).
  // Rendered → nudge into view; windowed out → jump its estimated offset in.
  useEffect(() => {
    if (selectedId == null) return
    const el = scrollRef.current?.querySelector(`[data-testid="msg-row-${selectedId}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'nearest' })
    else {
      const idx = sorted.findIndex((m) => m.id === selectedId)
      if (idx >= 0) scrollRef.current?.scrollTo({ top: Math.max(0, idx * rowHeight - viewportH / 2) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // "Load older messages" — only for a plain folder view (not search / label /
  // smart view / unified). Asks the main process whether the folder still has
  // older server mail to back-fill, and pulls one more page on click.
  const isPlainFolder = activeFolderId != null && !searching && activeLabelId == null && activeSmartViewId == null && !activeUnified
  const [canOlder, setCanOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  useEffect(() => {
    if (!isPlainFolder || activeFolderId == null) {
      setCanOlder(false)
      return
    }
    let alive = true
    void window.deskmail.mail.canBackfill(activeFolderId).then((v) => { if (alive) setCanOlder(v) })
    return () => { alive = false }
  }, [activeFolderId, isPlainFolder, messages.length])
  const loadOlder = async (): Promise<void> => {
    if (activeFolderId == null) return
    setLoadingOlder(true)
    try {
      await window.deskmail.mail.backfill(activeFolderId) // mail:changed refreshes the list
      setCanOlder(await window.deskmail.mail.canBackfill(activeFolderId))
    } finally {
      setLoadingOlder(false)
    }
  }

  const activeLabel = labels.find((l) => l.id === activeLabelId)
  const activeSmart = smartViews.find((v) => v.id === activeSmartViewId)
  const title = searching
    ? `Search: ${searchQuery}`
    : activeUnified
      ? 'All inboxes'
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

  // Right-click opens the message context menu at the cursor. Selecting the row
  // (so the reading pane follows, like a normal click) unless it's part of the
  // current tick selection — then we leave the selection intact and act on it.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: number } | null>(null)
  const openContext = (e: React.MouseEvent, msgId: number): void => {
    e.preventDefault()
    if (!(selectedIds.has(msgId) && selectedIds.size > 0)) void select(msgId)
    setCtxMenu({ x: e.clientX, y: e.clientY, id: msgId })
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

      {focusTabsOn && (
        <div className="flex flex-none border-b border-border">
          {(['focused', 'other'] as const).map((tab) => {
            const active = focusTab === tab
            const unread = tab === 'focused' ? focusedUnread : otherUnread
            return (
              <button
                key={tab}
                onClick={() => setFocusTab(tab)}
                data-testid={`focus-tab-${tab}`}
                className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-bold capitalize"
                style={active ? { color: 'var(--accent)', boxShadow: 'inset 0 -2px 0 var(--accent)' } : { color: 'var(--text-3)' }}
              >
                {tab}
                {unread > 0 && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[10.5px] font-bold text-accent">{unread}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

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

      <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {visibleMessages.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[14px] font-bold text-text-2">
              {searching ? `No messages match "${searchQuery}"` : focusTabsOn && messages.length > 0 ? `Nothing in ${focusTab === 'focused' ? 'Focused' : 'Other'}` : 'Nothing here yet'}
            </div>
            <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] text-text-3">
              {searching
                ? 'Try a different term, or clear the search to go back to the folder.'
                : "When your mail syncs it'll show up here. Add an account in Settings if you haven't yet."}
            </p>
          </div>
        ) : listStyle === 'table' ? (
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-[1] bg-panel">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[.4px] text-text-3">
                <th className="w-7" />
                {([['From', 'sender'], ['Subject', 'subject'], ['Date', 'date']] as [string, SortField][]).map(([label, field]) => (
                  <th
                    key={field}
                    onClick={() => setSortAndSave({ field, dir: sort.field === field && sort.dir === 'desc' ? 'asc' : 'desc' })}
                    className="cursor-pointer select-none px-2 py-1.5 font-bold hover:text-text-2"
                  >
                    {label}{sort.field === field ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr
                  key={m.id}
                  draggable
                  onDragStart={(e) => startDrag(e, m.id)}
                  onClick={() => handleSelect(m.id)}
                  onDoubleClick={() => onOpen?.(m.id)}
                  onContextMenu={(e) => openContext(e, m.id)}
                  className="cursor-pointer border-b border-border hover:bg-hover"
                  style={{ background: m.id === selectedId ? 'var(--accent-soft)' : undefined, opacity: m.isMuted ? 0.55 : 1 }}
                >
                  <td className="pl-3 pr-1">
                    <input type="checkbox" checked={selectedIds.has(m.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelected(m.id)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                  </td>
                  <td className="max-w-0 truncate px-2 py-1.5" style={{ fontWeight: m.isRead ? 400 : 700 }}>{m.fromName || m.fromEmail || 'Unknown sender'}</td>
                  <td className="max-w-0 truncate px-2 py-1.5" style={{ fontWeight: m.isRead ? 400 : 700 }}>
                    {m.importance === 'high' && <span className="mr-1 font-extrabold text-danger">!</span>}
                    {m.isStarred && <Icon name="star" size={12} className="mr-1 inline text-star" fill />}
                    {m.subject || '(no subject)'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-text-3">{fmtTime(m.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          (() => {
            // Flatten to entries first (date headers become rows in the same
            // array with their own height), then render only the visible slice
            // between two spacer divs — a 20k-message folder scrolls like 50.
            type Entry =
              | { kind: 'header'; key: string; label: string }
              | { kind: 'row'; key: string; m: MessageListItem; extra: { threadCount?: number; threadExpanded?: boolean; onToggleThread?: () => void; indent?: boolean } }
            let lastGroup = ''
            const entries: Entry[] = []
            const threads = threading ? groupThreads(sorted) : sorted.map((m) => ({ key: `s${m.id}`, items: [m] }))
            for (const t of threads) {
              const rep = t.items[0]
              if (showDateGroups) {
                const group = rep.isPinned ? 'Pinned' : messageDateGroup(rep.receivedAt)
                if (group !== lastGroup) {
                  lastGroup = group
                  entries.push({ kind: 'header', key: `grp-${group}-${rep.id}`, label: group })
                }
              }
              const expanded = expandedThreads.has(t.key)
              entries.push({ kind: 'row', key: `m-${rep.id}`, m: rep, extra: { threadCount: t.items.length, threadExpanded: expanded, onToggleThread: () => toggleThread(t.key) } })
              if (threading && expanded) for (const m of t.items.slice(1)) entries.push({ kind: 'row', key: `child-${m.id}`, m, extra: { indent: true } })
            }

            const heights = entries.map((e) => (e.kind === 'header' ? HEADER_H : rowHeight))
            const range = visibleRange(heights, scrollTop, viewportH)
            const slice = entries.slice(range.start, range.end)

            return (
              <>
                {range.topPad > 0 && <div style={{ height: range.topPad }} aria-hidden />}
                {slice.map((e) =>
                  e.kind === 'header' ? (
                    <div key={e.key} className="sticky top-0 z-[1] border-b border-border bg-panel px-3.5 py-1 text-[11px] font-bold uppercase tracking-[.5px] text-text-3" style={{ height: HEADER_H }}>
                      {e.label}
                    </div>
                  ) : (
                    <Row
                      key={e.key}
                      m={e.m}
                      selected={e.m.id === selectedId}
                      checked={selectedIds.has(e.m.id)}
                      onToggleCheck={() => toggleSelected(e.m.id)}
                      onSelect={() => handleSelect(e.m.id)}
                      onOpen={() => onOpen?.(e.m.id)}
                      onContextMenu={(ev) => openContext(ev, e.m.id)}
                      onDragStart={(ev) => startDrag(ev, e.m.id)}
                      rowPaddingY={rowPaddingY}
                      clamp={Math.max(1, previewLineCount)}
                      showSnippet={showSnippet}
                      showAvatars={showAvatars}
                      {...e.extra}
                    />
                  )
                )}
                {range.bottomPad > 0 && <div style={{ height: range.bottomPad }} aria-hidden />}
              </>
            )
          })()
        )}
        {isPlainFolder && canOlder && visibleMessages.length > 0 && (
          <button
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="flex w-full items-center justify-center gap-2 border-t border-border py-3 text-[12.5px] font-semibold text-text-2 hover:bg-hover disabled:opacity-50"
          >
            <Icon name="sync" size={14} className={loadingOlder ? 'animate-spin' : undefined} />
            {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
          </button>
        )}
      </div>
      {ctxMenu && (
        <MessageContextMenu x={ctxMenu.x} y={ctxMenu.y} messageId={ctxMenu.id} onClose={() => setCtxMenu(null)} />
      )}
    </>
  )
}
