import type { DB } from './database'

// Senders the user chose "always load images from". Persisted (survives
// restarts) and editable in Settings → Security. Keyed by lowercased address.

export function trustSender(db: DB, email: string): void {
  const key = email.trim().toLowerCase()
  if (!key) return
  db.run('INSERT INTO trusted_senders (email) VALUES (?) ON CONFLICT(email) DO NOTHING', [key])
}

export function untrustSender(db: DB, email: string): void {
  db.run('DELETE FROM trusted_senders WHERE email = ?', [email.trim().toLowerCase()])
}

export function isTrustedSender(db: DB, email: string | null | undefined): boolean {
  if (!email) return false
  return db.get('SELECT 1 x FROM trusted_senders WHERE email = ?', [email.trim().toLowerCase()]) != null
}

export function listTrustedSenders(db: DB): { email: string; addedAt: string }[] {
  const rows = db.all('SELECT email, added_at FROM trusted_senders ORDER BY email') as unknown as { email: string; added_at: string }[]
  return rows.map((r) => ({ email: r.email, addedAt: r.added_at }))
}
