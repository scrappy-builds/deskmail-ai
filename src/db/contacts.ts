import type { Contact } from '@shared/db'
import type { DB } from './database'

// Auto-collect a contact from mail. Keyed by email; fills in a name if we learn
// one later. No-op for blank/invalid addresses.
export function upsertContact(db: DB, name: string | null, email: string | null): void {
  const addr = email?.trim().toLowerCase()
  if (!addr || !addr.includes('@')) return
  // Emails are stored as a JSON array; we always store exactly [addr] so match on that.
  const existing = db.get('SELECT id, name FROM contacts WHERE emails_json = ?', [JSON.stringify([addr])]) as { id: number; name: string | null } | undefined
  if (existing) {
    if (name && !existing.name) db.run('UPDATE contacts SET name = ?, last_seen_at = datetime(\'now\') WHERE id = ?', [name, existing.id])
    else db.run("UPDATE contacts SET last_seen_at = datetime('now') WHERE id = ?", [existing.id])
    return
  }
  db.run("INSERT INTO contacts (name, emails_json, last_seen_at) VALUES (?, ?, datetime('now'))", [name ?? null, JSON.stringify([addr])])
}

interface Row {
  id: number
  name: string | null
  emails_json: string | null
}

function firstEmail(json: string | null): string | null {
  if (!json) return null
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? (arr[0] ?? null) : null
  } catch {
    return null
  }
}

export function listContacts(db: DB): Contact[] {
  const rows = db.all('SELECT id, name, emails_json FROM contacts ORDER BY name IS NULL, name, id') as unknown as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, email: firstEmail(r.emails_json) }))
}

// Autocomplete: match the query against name or email.
export function searchContacts(db: DB, query: string, limit = 8): Contact[] {
  const q = `%${query.trim().toLowerCase()}%`
  const rows = db.all(
    "SELECT id, name, emails_json FROM contacts WHERE LOWER(name) LIKE ? OR LOWER(emails_json) LIKE ? ORDER BY last_seen_at DESC LIMIT ?",
    [q, q, limit]
  ) as unknown as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, email: firstEmail(r.emails_json) }))
}
