import type { InviteData } from '@shared/db'
import { providerFromText } from '@shared/meetings'
import { resolveTzid, utcToLocalParts, zonedToUtc } from '@shared/tz'

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

// 20260709T140000Z / 20260709T140000 (+TZID param) -> local wall-clock parts.
// - `Z` suffix: a UTC instant — convert to local.
// - TZID param: convert from that zone (Windows names mapped to IANA) to local.
// - floating (neither): literal, unchanged.
// Unknown TZIDs keep the literal time and say so via tzUnknown.
export interface ParsedIcsTime {
  date: string | null
  time: string | null
  originalTime: string | null // sender's wall-clock HH:MM when we converted
  tzid: string | null
  tzUnknown: boolean
}

function parseDateTime(v: string, tzid?: string): ParsedIcsTime {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?/)
  if (!m) return { date: null, time: null, originalTime: null, tzid: null, tzUnknown: false }
  const literal = { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] && m[5] ? `${m[4]}:${m[5]}` : null }
  if (!literal.time) return { ...literal, originalTime: null, tzid: null, tzUnknown: false } // all-day

  const nums = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] as const
  if (m[6] === 'Z') {
    const local = utcToLocalParts(new Date(Date.UTC(nums[0], nums[1] - 1, nums[2], nums[3], nums[4])))
    return { ...local, originalTime: changed(local, literal) ? `${literal.time} UTC` : null, tzid: 'UTC', tzUnknown: false }
  }
  if (tzid) {
    const zone = resolveTzid(tzid)
    if (!zone) return { ...literal, originalTime: null, tzid, tzUnknown: true }
    const utc = zonedToUtc(nums[0], nums[1], nums[2], nums[3], nums[4], zone)
    if (!utc) return { ...literal, originalTime: null, tzid, tzUnknown: true }
    const local = utcToLocalParts(utc)
    return { ...local, originalTime: changed(local, literal) ? `${literal.time} ${tzid}` : null, tzid, tzUnknown: false }
  }
  return { ...literal, originalTime: null, tzid: null, tzUnknown: false }
}

function changed(local: { date: string; time: string }, literal: { date: string; time: string | null }): boolean {
  return local.time !== literal.time || local.date !== literal.date
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

  const start = parseDateTime(dtStart.value, dtStart.params.TZID)
  const dtEnd = get('DTEND')
  const end = dtEnd ? parseDateTime(dtEnd.value, dtEnd.params.TZID) : null
  const location = get('LOCATION')?.value ?? null
  const url = get('URL')?.value ?? null
  const description = get('DESCRIPTION')?.value ?? ''
  const organiserProp = get('ORGANIZER')
  const organiser = organiserProp ? personLabel(organiserProp) : null
  const organiserEmail = organiserProp?.value.match(/mailto:([^,;>\s]+)/i)?.[1] ?? null
  const guests = props.filter((p) => p.name === 'ATTENDEE').map(personLabel)
  const uid = get('UID')?.value ?? null

  // Find a join link and infer the provider.
  const linkSource = `${url ?? ''} ${location ?? ''} ${description}`
  const link = linkSource.match(/https?:\/\/\S+/)?.[0] ?? url ?? null
  const provider = providerFromText(link ?? location ?? '')

  return {
    title: summary.value || '(untitled event)',
    date: start.date ?? '',
    start: start.time,
    end: end?.time ?? null,
    location,
    organiser,
    guests,
    provider,
    joinUrl: link,
    originalTime: start.originalTime,
    tzUnknown: start.tzUnknown || undefined,
    uid,
    organiserEmail
  }
}

// --- Building outgoing invites (iTIP) -------------------------------------------

// RFC 5545 text escaping for SUMMARY/LOCATION/DESCRIPTION values.
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Local wall-clock (this machine's zone) → 20260710T130000Z form.
function toIcsUtc(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export type InviteMethod = 'REQUEST' | 'REPLY' | 'CANCEL'
export type PartStat = 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'

export interface BuildInviteOpts {
  uid: string
  title: string
  date: string // YYYY-MM-DD (local)
  start: string | null // HH:MM (local); null = all-day
  end: string | null
  location?: string | null
  description?: string | null
  organizer: { name: string; email: string }
  attendees: { email: string; name?: string | null }[]
  method: InviteMethod
  // For REPLY: my response, stamped as PARTSTAT on the (single) attendee line.
  myResponse?: PartStat
}

// Build a VCALENDAR/VEVENT that Outlook/Gmail render as an actionable invite
// (paired with nodemailer's icalEvent so the MIME part is text/calendar).
export function buildInviteIcs(o: BuildInviteOpts): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//DeskMail AI//EN',
    'VERSION:2.0',
    `METHOD:${o.method}`,
    'BEGIN:VEVENT',
    `UID:${o.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    'SEQUENCE:0',
    `SUMMARY:${escapeIcsText(o.title)}`
  ]
  if (o.start) {
    lines.push(`DTSTART:${toIcsUtc(o.date, o.start)}`)
    lines.push(`DTEND:${toIcsUtc(o.date, o.end ?? o.start)}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${o.date.replace(/-/g, '')}`)
  }
  if (o.location) lines.push(`LOCATION:${escapeIcsText(o.location)}`)
  if (o.description) lines.push(`DESCRIPTION:${escapeIcsText(o.description)}`)
  lines.push(`ORGANIZER;CN=${escapeIcsText(o.organizer.name)}:mailto:${o.organizer.email}`)
  for (const a of o.attendees) {
    const cn = a.name ? `;CN=${escapeIcsText(a.name)}` : ''
    const partstat = o.method === 'REPLY' && o.myResponse ? `;PARTSTAT=${o.myResponse}` : ';PARTSTAT=NEEDS-ACTION;RSVP=TRUE'
    lines.push(`ATTENDEE${cn}${partstat}:mailto:${a.email}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}
