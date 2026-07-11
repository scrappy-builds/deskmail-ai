import { shell } from 'electron'
import type { MeetingProvider } from '@shared/meetings'

// Derive a desktop-app deep link from a web join URL, or null if the provider
// has no desktop protocol (Meet / custom / in-person → open in the browser).
// Pure, so it's unit-tested.
export function appUriFor(provider: MeetingProvider, webUrl: string | null): string | null {
  if (!webUrl) return null
  switch (provider) {
    case 'teams':
      return webUrl.replace(/^https?:\/\/teams\.microsoft\.com/i, 'msteams:')
    case 'zoom': {
      const m = webUrl.match(/zoom\.us\/j\/(\d+)/)
      return m ? `zoommtg://zoom.us/join?confno=${m[1]}` : null
    }
    default:
      return null
  }
}

// Join a meeting: launch the installed desktop app when we have a deep link and
// the setting allows it, otherwise open the web link in the browser.
export async function joinMeeting(opts: {
  provider: MeetingProvider
  joinUrl: string | null
  launchDesktopApp: boolean
}): Promise<void> {
  if (!opts.joinUrl) return
  const appUri = opts.launchDesktopApp ? appUriFor(opts.provider, opts.joinUrl) : null
  await shell.openExternal(appUri ?? opts.joinUrl)
}
