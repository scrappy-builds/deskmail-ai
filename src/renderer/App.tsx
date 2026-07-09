import { useState } from 'react'
import { TitleBar } from './TitleBar'
import { CommandBar, type Mode } from './CommandBar'
import { Workspace } from './regions/Workspace'
import { ViewSettings } from './ViewSettings'
import { Settings } from './settings/Settings'
import { Compose } from './compose/Compose'
import { Calendar } from './calendar/Calendar'
import { useCalendar } from './store/calendarStore'

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const openNewEvent = useCalendar((s) => s.openNew)

  // The command-bar primary button is Compose in mail, New event in calendar.
  const onPrimary = (): void => (mode === 'mail' ? setComposeOpen(true) : openNewEvent())

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} onCompose={() => setComposeOpen(true)} />
      <CommandBar
        mode={mode}
        onMode={setMode}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onCompose={onPrimary}
      />

      {mode === 'mail' ? <Workspace onOpen={(id) => window.deskmail.openMessage(id)} /> : <Calendar />}

      {viewSettingsOpen && <ViewSettings onClose={() => setViewSettingsOpen(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {composeOpen && <Compose onClose={() => setComposeOpen(false)} />}
    </div>
  )
}
