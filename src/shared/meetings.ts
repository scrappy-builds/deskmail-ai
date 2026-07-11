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

// Resolve the join link for a self-created event. Only a pasted Custom link is a
// real link; we no longer fabricate one for Teams/Meet/Zoom (a genuine meeting
// needs each provider's own API — that's a roadmap item). Real links that arrive
// inside an actual invite are kept as-is on the event (joinUrl), not generated here.
export function generateJoinLink(provider: MeetingProvider, customUrl?: string): string | null {
  return provider === 'custom' ? customUrl?.trim() || null : null
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
