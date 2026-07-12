import { getAppSetting } from '../db/settings'
import type { DB } from '../db/database'
import type { NotifySettings } from '@shared/db'

export type { NotifySettings }

// Minutes-since-midnight from an "HH:MM" string.
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Is "now" inside a Do-Not-Disturb window? Handles overnight ranges (e.g.
// 22:00–07:00). An empty/zero-length window (from === to) is never active.
export function isDndActive(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false
  return fromMin < toMin ? nowMin >= fromMin && nowMin < toMin : nowMin >= fromMin || nowMin < toMin
}

// Should new-mail notifications be held back right now? True if notifications are
// off, Focus is on, or we're inside the scheduled DND window.
export function notificationsSuppressed(db: DB, now = new Date()): boolean {
  if (getAppSetting(db, 'notifications-enabled') === 'off') return true
  if (getAppSetting(db, 'focus-now') === 'on') return true
  if (getAppSetting(db, 'dnd-enabled') === 'on') {
    const from = toMinutes(getAppSetting(db, 'dnd-from') ?? '22:00')
    const to = toMinutes(getAppSetting(db, 'dnd-to') ?? '07:00')
    if (isDndActive(now.getHours() * 60 + now.getMinutes(), from, to)) return true
  }
  return false
}

export function getNotifySettings(db: DB): NotifySettings {
  return {
    enabled: getAppSetting(db, 'notifications-enabled') !== 'off',
    minimiseToTray: getAppSetting(db, 'minimise-to-tray') === 'on',
    dndEnabled: getAppSetting(db, 'dnd-enabled') === 'on',
    dndFrom: getAppSetting(db, 'dnd-from') ?? '22:00',
    dndTo: getAppSetting(db, 'dnd-to') ?? '07:00',
    focusNow: getAppSetting(db, 'focus-now') === 'on',
    launchAtStartup: getAppSetting(db, 'launch-at-startup') !== 'off', // default on
    vipOnly: getAppSetting(db, 'vip-only') === 'on' // default off
  }
}
