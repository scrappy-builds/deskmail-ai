import { useState } from 'react'
import { TitleBar } from './TitleBar'
import { CommandBar, type Mode } from './CommandBar'
import { Workspace } from './regions/Workspace'
import { ViewSettings } from './ViewSettings'
import { Settings } from './settings/Settings'
import { Compose } from './compose/Compose'
import { DraftsModal } from './compose/DraftsModal'
import { Calendar } from './calendar/Calendar'
import { Today } from './today/Today'
import { Toast } from './Toast'
import { useCalendar } from './store/calendarStore'
import type { DraftSummary } from '@shared/db'

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [compose, setCompose] = useState<{ open: boolean; draft?: DraftSummary }>({ open: false })
  const [draftsOpen, setDraftsOpen] = useState(false)
  const openNewEvent = useCalendar((s) => s.openNew)

  // The command-bar primary button is New event in calendar, Compose otherwise.
  const onPrimary = (): void => (mode === 'calendar' ? openNewEvent() : setCompose({ open: true }))

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} onCompose={() => setCompose({ open: true })} />
      <CommandBar
        mode={mode}
        onMode={setMode}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onCompose={onPrimary}
      />

      {mode === 'mail' && <Workspace onOpen={(id) => window.deskmail.openMessage(id)} onOpenDrafts={() => setDraftsOpen(true)} />}
      {mode === 'calendar' && <Calendar />}
      {mode === 'today' && <Today />}

      {viewSettingsOpen && <ViewSettings onClose={() => setViewSettingsOpen(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {compose.open && <Compose draft={compose.draft} onClose={() => setCompose({ open: false })} />}
      {draftsOpen && (
        <DraftsModal
          onClose={() => setDraftsOpen(false)}
          onEdit={(d) => {
            setDraftsOpen(false)
            setCompose({ open: true, draft: d })
          }}
        />
      )}
      <Toast />
    </div>
  )
}
