import { Icon } from '../Icon'
import { folders, initials, messages, type MockMessage } from '../mock/mailData'
import { useMail } from '../store/mailStore'

interface MessageListProps {
  rowPaddingY: number
  previewLineCount: number
  showSnippet: boolean
  showAvatars: boolean
  onOpen?: (id: number) => void
}

// Accent-tinted avatar for now; the real app will colour by contact (Stage 8).
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
  m: MockMessage
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  rowPaddingY: number
  clamp: number
  showSnippet: boolean
  showAvatars: boolean
}): JSX.Element {
  const weight = m.unread ? 700 : 500
  return (
    <div
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
        {m.unread && <span className="block h-[7px] w-[7px] rounded-full bg-accent" />}
      </div>
      {showAvatars && (
        <div
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-bold"
          style={{ background: AVATAR.bg, color: AVATAR.fg }}
        >
          {initials(m.fromName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px]">
          <span className="flex-1 truncate text-[13.5px] text-text" style={{ fontWeight: weight }}>
            {m.fromName}
          </span>
          {m.attach && <Icon name="clip" size={14} className="text-text-3" />}
          {m.starred && <Icon name="star" size={14} className="text-star" fill />}
          <span className="flex-none whitespace-nowrap text-[11.5px] text-text-3">{m.time}</span>
        </div>
        <div className="mt-px truncate text-[13px] text-text" style={{ fontWeight: weight }}>
          {m.subject}
        </div>
        {showSnippet && (
          <div
            className="mt-0.5 overflow-hidden text-[12.5px] leading-[1.45] text-text-2"
            style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: clamp }}
          >
            {m.snippet}
          </div>
        )}
        {m.label && (
          <div className="mt-1.5">
            <span
              className="rounded-sm px-[7px] py-0.5 text-[10.5px] font-bold tracking-[.2px]"
              style={{ color: 'var(--claude)', background: 'var(--claude-soft)' }}
            >
              {m.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MessageList({
  rowPaddingY,
  previewLineCount,
  showSnippet,
  showAvatars,
  onOpen
}: MessageListProps): JSX.Element {
  const { activeFolderId, selectedId, select } = useMail()
  const title = folders.find((f) => f.id === activeFolderId)?.name ?? 'Inbox'

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
        {messages.map((m) => (
          <Row
            key={m.id}
            m={m}
            selected={m.id === selectedId}
            onSelect={() => select(m.id)}
            onOpen={() => onOpen?.(m.id)}
            rowPaddingY={rowPaddingY}
            clamp={Math.max(1, previewLineCount)}
            showSnippet={showSnippet}
            showAvatars={showAvatars}
          />
        ))}
      </div>
    </>
  )
}
