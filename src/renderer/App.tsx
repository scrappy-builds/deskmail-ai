import { useEffect, useState } from 'react'
import { TitleBar } from './TitleBar'
import { useMail } from './store/mailStore'
import { CommandBar, type Mode } from './CommandBar'
import { Workspace } from './regions/Workspace'
import { ViewSettings } from './ViewSettings'
import { Settings } from './settings/Settings'
import { DraftsModal } from './compose/DraftsModal'
import { OutboxModal } from './compose/OutboxModal'
import { SmartViewBuilder } from './SmartViewBuilder'
import { Calendar } from './calendar/Calendar'
import { Today } from './today/Today'
import { Toast } from './Toast'
import { useCalendar } from './store/calendarStore'

// Draw a round unread badge (red circle + count) as a PNG data URL for the taskbar.
function drawBadge(n: number): string | null {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#d64545'
  ctx.beginPath()
  ctx.arc(16, 16, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(n > 99 ? '99+' : String(n), 16, 17)
  return c.toDataURL('image/png')
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const [smartBuilderOpen, setSmartBuilderOpen] = useState(false)
  const openNewEvent = useCalendar((s) => s.openNew)
  const folders = useMail((s) => s.folders)

  // Windows taskbar unread badge: draw a small PNG from the total Inbox unread and
  // hand it to the main process (or clear it at zero).
  useEffect(() => {
    const unread = folders.filter((f) => f.role === 'inbox').reduce((s, f) => s + f.unreadCount, 0)
    window.deskmail.setBadge(unread > 0 ? drawBadge(unread) : null)
  }, [folders])

  // Compose opens in its own resizable window (not an in-app overlay).
  const openCompose = (): void => window.deskmail.openCompose()

  // The command-bar primary button is New event in calendar, Compose otherwise.
  const onPrimary = (): void => (mode === 'calendar' ? openNewEvent() : openCompose())

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar
        onOpenSettings={() => setSettingsOpen(true)}
        onCompose={openCompose}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onMode={(m) => setMode(m)}
      />
      <CommandBar
        mode={mode}
        onMode={setMode}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onCompose={onPrimary}
      />

      {mode === 'mail' && (
        <Workspace
          onOpen={(id) => window.deskmail.openMessage(id)}
          onOpenDrafts={() => setDraftsOpen(true)}
          onOpenOutbox={() => setOutboxOpen(true)}
          onOpenSmartBuilder={() => setSmartBuilderOpen(true)}
        />
      )}
      {mode === 'calendar' && <Calendar />}
      {mode === 'today' && <Today />}

      {viewSettingsOpen && <ViewSettings onClose={() => setViewSettingsOpen(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {draftsOpen && (
        <DraftsModal
          onClose={() => setDraftsOpen(false)}
          onEdit={(d) => {
            setDraftsOpen(false)
            window.deskmail.openCompose(d.id)
          }}
        />
      )}
      {outboxOpen && <OutboxModal onClose={() => setOutboxOpen(false)} />}
      {smartBuilderOpen && <SmartViewBuilder onClose={() => setSmartBuilderOpen(false)} />}
      <Toast />
    </div>
  )
}
