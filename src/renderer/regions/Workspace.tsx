import { computeArrangement } from '@shared/layout'
import { useLayout } from '../store/layoutStore'
import { Sidebar } from './Sidebar'
import { MessageList } from './MessageList'
import { ReadingPane } from './ReadingPane'

export function Workspace({
  onOpen,
  onOpenDrafts,
  onOpenOutbox,
  onOpenSmartBuilder
}: {
  onOpen?: (id: number) => void
  onOpenDrafts?: () => void
  onOpenOutbox?: () => void
  onOpenSmartBuilder?: () => void
}): JSX.Element {
  const prefs = useLayout((s) => s.prefs)
  const a = computeArrangement(prefs)

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Sidebar */}
      {a.sidebar.visible && (
        <div
          className="flex flex-none flex-col border-border bg-panel"
          style={{
            width: a.sidebar.width,
            order: a.sidebar.order,
            borderRightWidth: a.sidebar.side === 'left' ? 1 : 0,
            borderLeftWidth: a.sidebar.side === 'right' ? 1 : 0
          }}
        >
          <Sidebar showLabels={a.sidebar.showLabels} onOpenDrafts={onOpenDrafts} onOpenOutbox={onOpenOutbox} onOpenSmartBuilder={onOpenSmartBuilder} />
        </div>
      )}

      {/* Main: message list + reading pane */}
      <div
        className="flex min-h-0 min-w-0 flex-1"
        style={{ order: 1, flexDirection: a.main.direction }}
      >
        <div
          className="flex min-h-0 min-w-0 flex-col bg-bg"
          style={{
            order: a.list.order,
            flex: a.list.grow ? '1 1 auto' : `0 1 ${a.list.basisPx}px`,
            minWidth: a.list.grow ? 0 : 262,
            borderRight: a.reading.position === 'right' ? '1px solid var(--border)' : undefined,
            borderLeft: a.reading.position === 'left' ? '1px solid var(--border)' : undefined,
            borderBottom: a.reading.bottom ? '1px solid var(--border)' : undefined
          }}
        >
          <MessageList
            rowPaddingY={a.rowPaddingY}
            previewLineCount={a.previewLineCount}
            showSnippet={a.showSnippet}
            showAvatars={prefs.messageListStyle === 'avatars'}
            onOpen={onOpen}
          />
        </div>

        {a.reading.visible && (
          <div
            className="flex min-h-0 flex-col bg-bg"
            style={{
              order: a.reading.order,
              flex: a.reading.bottom ? '0 0 46%' : '1 1 380px',
              minWidth: a.reading.bottom ? undefined : 0
            }}
          >
            <ReadingPane onOpen={onOpen} />
          </div>
        )}
      </div>
    </div>
  )
}
