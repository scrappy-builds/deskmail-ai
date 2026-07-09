import { Database } from 'node-sqlite3-wasm'
import { MIGRATIONS } from './schema'

export type DB = Database

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
  runMigrations(db)
  return db
}
