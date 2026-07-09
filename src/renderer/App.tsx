import { useState } from 'react'
import { TitleBar } from './TitleBar'
import { CommandBar, type Mode } from './CommandBar'
import { Workspace } from './regions/Workspace'
import { ViewSettings } from './ViewSettings'
import { Settings } from './settings/Settings'

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <CommandBar mode={mode} onMode={setMode} onOpenViewSettings={() => setViewSettingsOpen(true)} />

      {mode === 'mail' ? (
        <Workspace onOpen={(id) => window.deskmail.openMessage(id)} />
      ) : (
        <main className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-[420px] text-center">
            <div className="text-[17px] font-bold">The calendar goes here</div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-text-2">
              Month view, events and meeting links land in Stage 7. For now the layout system is what
              I'm building — try the presets in View Settings.
            </p>
          </div>
        </main>
      )}

      {viewSettingsOpen && <ViewSettings onClose={() => setViewSettingsOpen(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
