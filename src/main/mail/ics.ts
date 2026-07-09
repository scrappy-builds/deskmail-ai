import type { InviteData } from '@shared/db'
import { providerFromText } from '@shared/meetings'

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

// Unfold (RFC 5545: continuation lines start with a space/tab) then parse.
function parseLines(ics: string): Prop[] {
  const raw = ics.replace(/\r\n/g, '\n').split('\n')
  const unfolded: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.slice(1)
    } else {
      unfolded.push(line)
    }
  }
  return unfolded
    .filter((l) => l.includes(':'))
    .map((l) => {
      const idx = l.indexOf(':')
      const left = l.slice(0, idx)
      const value = l.slice(idx + 1)
      const [name, ...paramParts] = left.split(';')
      const params: Record<string, string> = {}
      for (const p of paramParts) {
        const eq = p.indexOf('=')
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
      }
      return { name: name.toUpperCase(), params, value }
    })
}

// 20260709T140000Z -> { date: '2026-07-09', time: '14:00' }. Literal time (no TZ
// conversion). ponytail: literal HH:MM is fine for one person; add TZ handling if it bites.
function parseDateTime(v: string): { date: string | null; time: string | null } {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!m) return { date: null, time: null }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] && m[5] ? `${m[4]}:${m[5]}` : null }
}

function personLabel(p: Prop): string {
  return p.params.CN || p.value.replace(/^mailto:/i, '')
}

// Parse an ICS calendar body into invite data. Returns null if there's no usable event.
export function parseIcs(ics: string): InviteData | null {
  const props = parseLines(ics)
  if (!props.some((p) => p.name === 'BEGIN' && p.value === 'VEVENT')) return null

  const get = (name: string): Prop | undefined => props.find((p) => p.name === name)
  const dtStart = get('DTSTART')
  const summary = get('SUMMARY')
  if (!dtStart || !summary) return null

  const start = parseDateTime(dtStart.value)
  const end = get('DTEND') ? parseDateTime(get('DTEND')!.value) : { date: null, time: null }
  const location = get('LOCATION')?.value ?? null
  const url = get('URL')?.value ?? null
  const description = get('DESCRIPTION')?.value ?? ''
  const organiser = get('ORGANIZER') ? personLabel(get('ORGANIZER')!) : null
  const guests = props.filter((p) => p.name === 'ATTENDEE').map(personLabel)

  // Find a join link and infer the provider.
  const linkSource = `${url ?? ''} ${location ?? ''} ${description}`
  const link = linkSource.match(/https?:\/\/\S+/)?.[0] ?? url ?? null
  const provider = providerFromText(link ?? location ?? '')

  return {
    title: summary.value || '(untitled event)',
    date: start.date ?? '',
    start: start.time,
    end: end.time,
    location,
    organiser,
    guests,
    provider,
    joinUrl: link
  }
}
