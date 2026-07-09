import { Icon } from '../Icon'
import type { MessageListItem } from '@shared/db'
import { fmtTime, initials } from '../mail/format'
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
  onSelect,
  onOpen,
  rowPaddingY,
  clamp,
  showSnippet,
  showAvatars
}: {
  m: MessageListItem
  selected: boolean
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
        borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`
      }}
    >
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
  const { folders, messages, activeFolderId, selectedId, select, searchQuery } = useMail()
  const openInFullWindow = useLayout((s) => s.prefs.openEmailBehaviour === 'full-window')
  const searching = searchQuery.trim().length > 0
  const title = searching ? `Search: ${searchQuery}` : folders.find((f) => f.id === activeFolderId)?.name ?? 'Inbox'

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
        <button className="flex cursor-pointer rounded-md p-1.5 text-text-2 hover:bg-raised" title="Select">
          <Icon name="check" size={18} />
        </button>
      </div>
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
