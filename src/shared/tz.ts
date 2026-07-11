// Timezone conversion with the built-in Intl API — no dependency.

// The ~20 Windows timezone names that actually show up in invites, mapped to
// IANA. Anything else falls back to "timezone unknown" handling upstream.
const WINDOWS_TZ: Record<string, string> = {
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'FLE Standard Time': 'Europe/Kyiv',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Russian Standard Time': 'Europe/Moscow',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'Arabian Standard Time': 'Asia/Dubai',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'South Africa Standard Time': 'Africa/Johannesburg',
  UTC: 'UTC'
}

// Resolve a TZID (IANA like "Europe/Paris" or Windows like "Romance Standard
// Time") to a usable IANA zone, or null when unknown.
export function resolveTzid(tzid: string): string | null {
  const candidate = WINDOWS_TZ[tzid] ?? tzid
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate })
    return candidate
  } catch {
    return null
  }
}

// What offset (ms) does `timeZone` apply at this UTC instant?
function tzOffsetMs(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(utc)) p[part.type] = part.value
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
  return asUtc - utc.getTime()
}

// Wall-clock parts in an IANA zone → the UTC instant. Two-pass: guess with the
// offset at the naive instant, then re-check at the guess — handles DST edges.
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date | null {
  try {
    const naive = Date.UTC(y, mo - 1, d, h, mi)
    const first = tzOffsetMs(new Date(naive), timeZone)
    const second = tzOffsetMs(new Date(naive - first), timeZone)
    return new Date(naive - second)
  } catch {
    return null
  }
}

// A UTC instant → this machine's local {date: 'YYYY-MM-DD', time: 'HH:MM'}.
export function utcToLocalParts(utc: Date): { date: string; time: string } {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}`,
    time: `${pad(utc.getHours())}:${pad(utc.getMinutes())}`
  }
}
