import type { MessageListItem } from '@shared/db'

// Normalise a subject for thread grouping: strip Re:/Fwd: prefixes (repeatedly),
// collapse whitespace, lowercase.
export function normalizeSubject(s: string | null): string {
  let out = (s ?? '').trim()
  let prev
  do {
    prev = out
    out = out.replace(/^(re|fwd?|fw)\s*:\s*/i, '')
  } while (out !== prev)
  return out.replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface Thread {
  key: string
  items: MessageListItem[] // in the input order (representative = items[0])
}

// Group an already-sorted list into threads by normalised subject, preserving the
// order in which each thread first appears. Messages with no subject stand alone.
export function groupThreads(msgs: MessageListItem[]): Thread[] {
  const map = new Map<string, MessageListItem[]>()
  const order: string[] = []
  for (const m of msgs) {
    const k = normalizeSubject(m.subject) || `__solo_${m.id}`
    let bucket = map.get(k)
    if (!bucket) {
      bucket = []
      map.set(k, bucket)
      order.push(k)
    }
    bucket.push(m)
  }
  return order.map((k) => ({ key: k, items: map.get(k)! }))
}
