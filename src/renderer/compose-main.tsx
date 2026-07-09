import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/hanken-grotesk/800.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Compose } from './compose/Compose'
import { Toast } from './Toast'
import { ErrorBoundary } from './ErrorBoundary'
import type { DraftSummary } from '@shared/db'

// A draft id may be passed on the URL when editing an existing draft.
const draftId = Number(new URLSearchParams(location.search).get('draftId')) || null

// Match the app's theme (persisted). Independent window, so read it directly.
void window.deskmail.getSettings().then((s) => {
  document.documentElement.setAttribute('data-theme', s.theme)
})

// Load the draft (if any) before rendering, so Compose gets its initial state.
function Root(): JSX.Element | null {
  const [draft, setDraft] = useState<DraftSummary | null | 'loading'>(draftId ? 'loading' : null)

  useEffect(() => {
    if (draftId) void window.deskmail.compose.getDraft(draftId).then(setDraft)
  }, [])

  if (draft === 'loading') return null
  return (
    <>
      <Compose draft={draft ?? undefined} />
      <Toast />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>
)
