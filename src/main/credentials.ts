import { safeStorage } from 'electron'
import type { DB } from '../db/database'

// Credentials at rest = OS-encrypted ciphertext only (DPAPI on Windows via
// Electron safeStorage). The plaintext password never touches the DB or disk.

export function storeCredential(db: DB, accountId: number, secret: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("I can't store your password securely — OS secure storage isn't available.")
  }
  const enc = safeStorage.encryptString(secret) // Buffer
  db.run(
    `INSERT INTO credentials (account_id, secret_enc, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET secret_enc = excluded.secret_enc, updated_at = datetime('now')`,
    [accountId, enc]
  )
}

export function getCredential(db: DB, accountId: number): string | null {
  const row = db.get('SELECT secret_enc FROM credentials WHERE account_id = ?', [accountId]) as
    | { secret_enc: Uint8Array }
    | undefined
  if (!row) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.secret_enc))
  } catch {
    // Ciphertext is bound to the OS user/machine that created it. After restoring
    // a backup onto a NEW computer it can't be decrypted here — treat as "no
    // password" so sync fails gracefully and the owner re-enters it once.
    return null
  }
}
