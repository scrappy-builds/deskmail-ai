import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// Copy the whole local store (DB + attachments + settings) into a single
// self-contained, timestamped backup folder under destParent. Returns its path.
export function backupTo(userDataDir: string, destParent: string, when = stamp()): string {
  const dest = join(destParent, `deskmail-backup-${when}`)
  mkdirSync(dest, { recursive: true })

  const db = join(userDataDir, 'deskmail.db')
  if (existsSync(db)) copyFileSync(db, join(dest, 'deskmail.db'))

  const attachments = join(userDataDir, 'attachments')
  if (existsSync(attachments)) cpSync(attachments, join(dest, 'attachments'), { recursive: true })

  const settings = join(userDataDir, 'settings.json')
  if (existsSync(settings)) copyFileSync(settings, join(dest, 'settings.json'))

  return dest
}

// Restore a backup folder's contents back into the live data directory.
// The caller must close the DB first and reopen it afterwards.
export function restoreFrom(backupDir: string, userDataDir: string): void {
  mkdirSync(userDataDir, { recursive: true })

  const db = join(backupDir, 'deskmail.db')
  if (existsSync(db)) copyFileSync(db, join(userDataDir, 'deskmail.db'))

  const attachments = join(backupDir, 'attachments')
  if (existsSync(attachments)) cpSync(attachments, join(userDataDir, 'attachments'), { recursive: true })

  const settings = join(backupDir, 'settings.json')
  if (existsSync(settings)) copyFileSync(settings, join(userDataDir, 'settings.json'))
}
