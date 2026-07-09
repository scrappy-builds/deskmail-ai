import type { SignatureData } from '@shared/db'
import type { DB } from './database'

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
