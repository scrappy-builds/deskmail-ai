import { useState } from 'react'
import { TitleBar } from './TitleBar'
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

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const [smartBuilderOpen, setSmartBuilderOpen] = useState(false)
  const openNewEvent = useCalendar((s) => s.openNew)

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
