export function initials(name: string | null, fallback = '?'): string {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/)
  const i = (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  return i.toUpperCase() || fallback
}

// Compact timestamp for message rows: time today, otherwise a short date.
export function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// Bucket a message's date into a list separator label (Today / Yesterday / …).
// `now` is injectable for testing.
export function messageDateGroup(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Older'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Older'
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startToday) return 'Today'
  if (t >= startToday - 86_400_000) return 'Yesterday'
  if (t >= startToday - 6 * 86_400_000) return 'This week'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Earlier this month'
  return 'Older'
}

export function fmtFullDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
