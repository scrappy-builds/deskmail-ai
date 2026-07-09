// Meeting providers — shared between the renderer (labels/colours), the main
// process (launch), and tests. Framework-free.

export type MeetingProvider = 'teams' | 'meet' | 'zoom' | 'inperson' | 'custom'

export interface ProviderInfo {
  label: string
  colour: string
  video: boolean
}

export const PROVIDERS: Record<MeetingProvider, ProviderInfo> = {
  teams: { label: 'Microsoft Teams', colour: '#5b5fc7', video: true },
  meet: { label: 'Google Meet', colour: '#2aa775', video: true },
  zoom: { label: 'Zoom', colour: '#3b82e0', video: true },
  inperson: { label: 'In person', colour: '#8a8a8a', video: false },
  custom: { label: 'Custom link', colour: '#1e7a38', video: false }
}

function rand(n: number): string {
  let s = ''
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Generate a plausible join link for a video provider. Real per-meeting links
// need the provider's API/OAuth; this mirrors the prototype (format-correct URL)
// so join/launch works end to end. custom uses the pasted URL as-is.
// ponytail: format-correct placeholder links; wire real provider APIs if/when needed.
export function generateJoinLink(provider: MeetingProvider, customUrl?: string): string | null {
  switch (provider) {
    case 'teams':
      return `https://teams.microsoft.com/l/meetup-join/${rand(8)}${rand(8)}`
    case 'meet':
      return `https://meet.google.com/${rand(3)}-${rand(4)}-${rand(3)}`
    case 'zoom':
      return `https://zoom.us/j/${Math.floor(1e9 + Math.random() * 8e9)}`
    case 'custom':
      return customUrl?.trim() || null
    case 'inperson':
      return null
  }
}

// Detect a provider from a URL or location string (used when parsing invites).
export function providerFromText(text: string): MeetingProvider {
  const t = text.toLowerCase()
  if (t.includes('teams.microsoft')) return 'teams'
  if (t.includes('meet.google')) return 'meet'
  if (t.includes('zoom.us')) return 'zoom'
  if (t.startsWith('http')) return 'custom'
  return 'inperson'
}
