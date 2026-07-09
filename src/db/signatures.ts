import type { DB } from './database'

// Per-account signatures. Stage 6 just needs a default that Compose can insert;
// full management (variants, live preview) arrives in Stage 8.

export function getDefaultSignature(db: DB, accountId: number): string | null {
  const row = db.get(
    'SELECT body FROM signatures WHERE account_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
    [accountId]
  ) as { body: string | null } | undefined
  return row?.body ?? null
}

// Create a plain first-person default signature the first time an account is
// added, so Compose has something to insert. British English, no fluff.
export function ensureDefaultSignature(db: DB, accountId: number, displayName: string): void {
  const exists = db.get('SELECT 1 FROM signatures WHERE account_id = ?', [accountId])
  if (exists) return
  const body = `Thanks,\n${displayName}`
  db.run(
    "INSERT INTO signatures (account_id, name, body, is_default) VALUES (?, 'Default', ?, 1)",
    [accountId, body]
  )
}
