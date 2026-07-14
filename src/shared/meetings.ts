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

// Strong, specific join-link patterns for the three video providers. Deliberately
// stricter than providerFromText's domain check: these match an *actual* meeting
// join URL, not a mention of the product — so scanning an email body for one
// won't fire on newsletters that merely say "we use Teams".
// URL body char class: stop at whitespace and the HTML/quote delimiters that
// wrap a link in an email body, so we don't swallow `">join</a>` etc.
const U = `[^\\s"'<>]`
const JOIN_LINK = [
  { provider: 'teams' as const, re: new RegExp(`https://teams\\.(?:microsoft|live)\\.com/l/meetup-join/${U}+|https://teams\\.live\\.com/meet/${U}+`, 'i') },
  { provider: 'meet' as const, re: new RegExp(`https://meet\\.google\\.com/[a-z-]{3,}${U}*`, 'i') },
  { provider: 'zoom' as const, re: new RegExp(`https://[\\w.-]*zoom\\.us/(?:j|my|w|wc)/${U}+`, 'i') }
]

// Find the first real video-meeting join link in a blob of text (e.g. an email
// body), returning the link and its provider. Trailing HTML/quote punctuation is
// trimmed off the match. Null when there's no genuine join link.
export function meetingJoinLink(text: string): { url: string; provider: MeetingProvider } | null {
  for (const { provider, re } of JOIN_LINK) {
    const m = re.exec(text)
    if (m) return { url: m[0].replace(/["'<>)\]}]+$/, ''), provider }
  }
  return null
}
