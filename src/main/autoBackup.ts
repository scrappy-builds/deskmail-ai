import { backupTo } from './backup'
import { getAppSetting, setAppSetting } from '../db/settings'
import { quickCheckOk, type DB } from '../db/database'

const DAY_MS = 24 * 60 * 60 * 1000

// Run a scheduled backup if one is configured and enough days have passed since
// the last. Called on startup and hourly. ponytail: coarse hourly check — plenty
// for a daily/weekly cadence; tighten only if sub-hour backups are ever wanted.
export function checkAutoBackup(db: DB, userDataDir: string): void {
  const dir = getAppSetting(db, 'auto-backup-dir')
  const days = Number(getAppSetting(db, 'auto-backup-days') ?? '0')
  if (!dir || !days || days < 1) return
  const last = getAppSetting(db, 'auto-backup-last')
  if (last && Date.now() - new Date(last).getTime() < days * DAY_MS) return
  // Never let a corrupt database overwrite the last good backup — that's the
  // actual data-loss vector this check closes.
  if (!quickCheckOk(db)) {
    console.error('Auto-backup skipped: database failed its integrity check.')
    return
  }
  try {
    backupTo(userDataDir, dir)
    setAppSetting(db, 'auto-backup-last', new Date().toISOString())
  } catch (err) {
    console.error('Auto-backup failed:', (err as Error).message)
  }
}
