import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/hanken-grotesk/800.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReminderPopup } from './calendar/ReminderPopup'
import { applyTheme } from './theme'
import { ErrorBoundary } from './ErrorBoundary'

// The event id is passed on the URL by the main process.
const eventId = Number(new URLSearchParams(location.search).get('eventId'))

// Match the app's theme (persisted). Independent window, so read it directly.
void window.deskmail.getSettings().then(applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ReminderPopup eventId={eventId} />
    </ErrorBoundary>
  </StrictMode>
)
