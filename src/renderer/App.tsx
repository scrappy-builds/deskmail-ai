import { useState } from 'react'
import { TitleBar } from './TitleBar'
import { CommandBar, type Mode } from './CommandBar'

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar />
      <CommandBar mode={mode} onMode={setMode} />

      {/* Workspace — the layout system and real screens land in Stage 2 onward. */}
      <main className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-[420px] text-center">
          <div className="text-[17px] font-bold">
            {mode === 'mail' ? 'The mailbox goes here' : 'The calendar goes here'}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-2">
            This is the shell for now — the sidebar, message list and reading pane come next. I'm
            building it in stages so it stays solid rather than rushing the whole thing at once.
          </p>
        </div>
      </main>
    </div>
  )
}
