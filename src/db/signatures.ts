import type { SignatureData, SignatureItem } from '@shared/db'
import type { DB } from './database'

// --- Multiple signatures per account (rich HTML, one default) ----------------
export function listSignatures(db: DB, accountId: number): SignatureItem[] {
  const rows = db.all(
    'SELECT id, name, body, is_default, append_to_new FROM signatures WHERE account_id = ? ORDER BY is_default DESC, name, id',
    [accountId]
  ) as unknown as { id: number; name: string | null; body: string | null; is_default: number; append_to_new: number }[]
  return rows.map((r) => ({ id: r.id, name: r.name ?? 'Untitled', body: r.body ?? '', isDefault: !!r.is_default, appendToNew: !!r.append_to_new }))
}

export function createSignature(db: DB, accountId: number, name: string, body: string): number {
  const count = (db.get('SELECT COUNT(*) c FROM signatures WHERE account_id = ?', [accountId]) as { c: number }).c
  db.run('INSERT INTO signatures (account_id, name, body, is_default, append_to_new) VALUES (?, ?, ?, ?, 1)', [accountId, name, body, count === 0 ? 1 : 0])
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function updateSignatureById(db: DB, id: number, name: string, body: string): void {
  db.run("UPDATE signatures SET name = ?, body = ?, updated_at = datetime('now') WHERE id = ?", [name, body, id])
}

export function deleteSignature(db: DB, id: number): void {
  db.run('DELETE FROM signatures WHERE id = ?', [id])
}

export function setDefaultSignature(db: DB, accountId: number, id: number): void {
  db.run('UPDATE signatures SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE account_id = ?', [id, accountId])
}

// Whether the default signature is auto-appended to new messages.
export function setSignatureAppend(db: DB, accountId: number, on: boolean): void {
  db.run('UPDATE signatures SET append_to_new = ? WHERE account_id = ? AND is_default = 1', [on ? 1 : 0, accountId])
}

export function getSignatureBody(db: DB, id: number): string | null {
  const r = db.get('SELECT body FROM signatures WHERE id = ?', [id]) as { body: string | null } | undefined
  return r?.body ?? null
}

// Per-account signatures. Default seeded on account create; managed in Settings.

export function getSignatureData(db: DB, accountId: number): SignatureData | null {
  const row = db.get(
    'SELECT id, body, append_to_new FROM signatures WHERE account_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
    [accountId]
  ) as { id: number; body: string | null; append_to_new: number } | undefined
  return row ? { id: row.id, body: row.body ?? '', appendToNew: !!row.append_to_new } : null
}

// Body to append when composing/sending — null when the toggle is off.
export function getDefaultSignature(db: DB, accountId: number): string | null {
  const s = getSignatureData(db, accountId)
  return s && s.appendToNew ? s.body : null
}

export function updateSignature(db: DB, accountId: number, body: string, appendToNew: boolean): void {
  const existing = getSignatureData(db, accountId)
  if (existing) {
    db.run("UPDATE signatures SET body = ?, append_to_new = ?, updated_at = datetime('now') WHERE id = ?", [body, appendToNew ? 1 : 0, existing.id])
  } else {
    db.run("INSERT INTO signatures (account_id, name, body, is_default, append_to_new) VALUES (?, 'Default', ?, 1, ?)", [accountId, body, appendToNew ? 1 : 0])
  }
}

// Create a plain first-person default signature the first time an account is added.
export function ensureDefaultSignature(db: DB, accountId: number, displayName: string): void {
  const exists = db.get('SELECT 1 FROM signatures WHERE account_id = ?', [accountId])
  if (exists) return
  db.run("INSERT INTO signatures (account_id, name, body, is_default, append_to_new) VALUES (?, 'Default', ?, 1, 1)", [accountId, `Thanks,\n${displayName}`])
}
