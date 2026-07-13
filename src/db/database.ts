import { existsSync, renameSync } from 'node:fs'
import { Database } from 'node-sqlite3-wasm'
import { MIGRATIONS } from './schema'

export type DB = Database

// True when SQLite's quick integrity check passes. Never throws.
export function quickCheckOk(db: Database): boolean {
  try {
    const rows = db.all('PRAGMA quick_check') as { quick_check: string }[]
    return rows.length === 1 && rows[0].quick_check === 'ok'
  } catch {
    return false
  }
}

// Startup gate: probe an existing DB file before opening it for real. A corrupt
// file is moved aside (deskmail.db.corrupt-<ts>) so the app starts on a fresh
// store instead of writing into damage — returns the quarantine path so the
// caller can tell the user and point at restore-from-backup. Healthy → null.
export function quarantineIfCorrupt(file: string): string | null {
  if (!existsSync(file)) return null
  let ok = false
  try {
    const probe = new Database(file)
    ok = quickCheckOk(probe)
    probe.close()
  } catch {
    ok = false
  }
  if (ok) return null
  const quarantined = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
  renameSync(file, quarantined)
  return quarantined
}

// Try to upgrade journalling to WAL and VERIFY the answer — WASM SQLite VFSes
// often silently refuse WAL, and pretending otherwise helps nobody.
function tryEnableWal(db: Database): void {
  try {
    const r = db.get('PRAGMA journal_mode=WAL') as { journal_mode?: string } | undefined
    if ((r?.journal_mode ?? '').toLowerCase() !== 'wal') {
      // stderr, not stdout — this module runs under the MCP stdio server too.
      console.warn('SQLite driver declined WAL; staying on the default journal mode.')
    }
  } catch {
    /* pragma unsupported — default journalling is fine */
  }
}

// Apply any migrations newer than the DB's current user_version, each in a
// transaction. Version = migration index + 1.
export function runMigrations(db: Database): void {
  const current = (db.get('PRAGMA user_version') as { user_version: number }).user_version
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version - 1]
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

export function openDatabase(file: string): Database {
  const db = new Database(file)
  db.exec('PRAGMA foreign_keys = ON')
  // The running app AND the Claude MCP server open this same file. WAL is usually
  // declined by the WASM VFS, so writes serialise on a rollback journal — without
  // a busy timeout a concurrent writer fails immediately with SQLITE_BUSY, which
  // is exactly what made Claude's moves/rule changes intermittently "not work".
  // Wait for the lock instead of erroring out.
  db.exec('PRAGMA busy_timeout = 5000')
  tryEnableWal(db)
  runMigrations(db)
  return db
}
