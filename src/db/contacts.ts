import type { Contact, ContactDetail, ContactInput } from '@shared/db'
import type { DB } from './database'

function parseArr(json: string | null): string[] {
  if (!json) return []
  try {
    const a = JSON.parse(json)
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}
const emailJson = (email: string | null): string | null => {
  const addr = email?.trim().toLowerCase()
  return addr ? JSON.stringify([addr]) : null
}

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

// --- Manual address book (create / edit / delete + groups) ------------------
interface DetailRow {
  id: number
  name: string | null
  emails_json: string | null
  org: string | null
  notes: string | null
  groups_json: string | null
}
function toDetail(r: DetailRow): ContactDetail {
  return { id: r.id, name: r.name, email: firstEmail(r.emails_json), org: r.org, notes: r.notes, groups: parseArr(r.groups_json) }
}

export function listContactsDetail(db: DB): ContactDetail[] {
  const rows = db.all('SELECT id, name, emails_json, org, notes, groups_json FROM contacts ORDER BY name IS NULL, name, id') as unknown as DetailRow[]
  return rows.map(toDetail)
}

export function listContactGroups(db: DB): string[] {
  const rows = db.all('SELECT groups_json FROM contacts WHERE groups_json IS NOT NULL') as unknown as { groups_json: string | null }[]
  const set = new Set<string>()
  for (const r of rows) for (const g of parseArr(r.groups_json)) set.add(g)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function createContact(db: DB, c: ContactInput): number {
  db.run(
    "INSERT INTO contacts (name, emails_json, org, notes, groups_json, last_seen_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
    [c.name, emailJson(c.email), c.org, c.notes, JSON.stringify(c.groups)]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function updateContact(db: DB, id: number, c: ContactInput): void {
  db.run(
    'UPDATE contacts SET name = ?, emails_json = ?, org = ?, notes = ?, groups_json = ? WHERE id = ?',
    [c.name, emailJson(c.email), c.org, c.notes, JSON.stringify(c.groups), id]
  )
}

export function deleteContact(db: DB, id: number): void {
  db.run('DELETE FROM contacts WHERE id = ?', [id])
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
