import type { DB } from './database'

// Per-folder incremental sync cursor (migration v27). Tracks where we are in
// each folder's UID space so sync can fetch only new mail (above last_seen_uid)
// and back-fill only older mail (below backfill_low_uid), instead of re-pulling
// a fixed window every time.

export interface FolderCursor {
  folderId: number
  uidValidity: number | null
  lastSeenUid: number
  backfillLowUid: number | null
}

interface Row {
  folder_id: number
  uidvalidity: number | null
  last_seen_uid: number
  backfill_low_uid: number | null
}

export function getFolderCursor(db: DB, folderId: number): FolderCursor | null {
  const r = db.get('SELECT * FROM folder_sync WHERE folder_id = ?', [folderId]) as unknown as Row | undefined
  if (!r) return null
  return { folderId: r.folder_id, uidValidity: r.uidvalidity, lastSeenUid: r.last_seen_uid, backfillLowUid: r.backfill_low_uid }
}

// Record the new-mail high-water mark (and the folder's UIDVALIDITY). Pass
// backfillLow on the first seed to set the back-fill floor; it's only applied
// when the folder has no floor yet (COALESCE) and last_seen only ever climbs.
export function setCursorHigh(db: DB, folderId: number, uidValidity: number, lastSeenUid: number, backfillLow?: number | null): void {
  db.run(
    `INSERT INTO folder_sync (folder_id, uidvalidity, last_seen_uid, backfill_low_uid)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(folder_id) DO UPDATE SET
       uidvalidity      = excluded.uidvalidity,
       last_seen_uid    = MAX(folder_sync.last_seen_uid, excluded.last_seen_uid),
       backfill_low_uid = COALESCE(folder_sync.backfill_low_uid, excluded.backfill_low_uid)`,
    [folderId, uidValidity, lastSeenUid, backfillLow ?? null]
  )
}

// Lower the back-fill floor after a back-fill page (older mail) lands.
export function setCursorLow(db: DB, folderId: number, backfillLowUid: number): void {
  db.run('UPDATE folder_sync SET backfill_low_uid = ? WHERE folder_id = ?', [backfillLowUid, folderId])
}

export function wipeFolderCursor(db: DB, folderId: number): void {
  db.run('DELETE FROM folder_sync WHERE folder_id = ?', [folderId])
}

// --- Pure planning (no DB — unit-tested directly) -----------------------------

// A changed UIDVALIDITY means the server reassigned its UID space; our cached
// UIDs for this folder are now meaningless and must be wiped and refetched.
export function uidValidityChanged(stored: number | null, remote: number): boolean {
  return stored != null && stored !== remote
}

// The UID range to fetch for NEW mail above the cursor, or null if the mailbox
// hasn't grown. uidNext is the UID the *next* message will get, so the highest
// existing UID is uidNext - 1.
export function newMailRange(lastSeenUid: number, uidNext: number): string | null {
  return uidNext - 1 > lastSeenUid ? `${lastSeenUid + 1}:*` : null
}

// The next back-fill page (older mail) as an inclusive [low, high] UID window,
// or null when there's nothing left below the floor (reached UID 1, or the
// folder hasn't been seeded yet so there's no floor).
export function backfillWindow(backfillLowUid: number | null, pageSize: number): { low: number; high: number } | null {
  if (backfillLowUid == null || backfillLowUid <= 1) return null
  const high = backfillLowUid - 1
  const low = Math.max(1, high - pageSize + 1)
  return { low, high }
}

// The history-depth cutoff as an ISO timestamp: back-fill stops once it reaches
// mail older than this. depthDays <= 0 (or not a number) means "everything".
export function depthCutoffIso(depthDays: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(depthDays) || depthDays <= 0) return null
  return new Date(now.getTime() - depthDays * 86400000).toISOString()
}

// --- Flag reconciliation ------------------------------------------------------

export interface LocalFlag { uid: number; isRead: boolean; isStarred: boolean }
export interface ServerFlag { isRead: boolean; isStarred: boolean }
export interface FlagReconcile {
  readChanges: { uid: number; isRead: boolean }[]
  starChanges: { uid: number; isStarred: boolean }[]
  deletedUids: number[] // held locally but no longer on the server (within the window)
}

// Diff our cached read/starred flags against the server's for a UID window.
// A local UID missing from the server map = deleted/moved server-side. Pure, so
// the two-way-state logic is unit-tested without a network.
export function diffFlags(locals: LocalFlag[], server: Map<number, ServerFlag>): FlagReconcile {
  const readChanges: { uid: number; isRead: boolean }[] = []
  const starChanges: { uid: number; isStarred: boolean }[] = []
  const deletedUids: number[] = []
  for (const l of locals) {
    const s = server.get(l.uid)
    if (!s) {
      deletedUids.push(l.uid)
      continue
    }
    if (s.isRead !== l.isRead) readChanges.push({ uid: l.uid, isRead: s.isRead })
    if (s.isStarred !== l.isStarred) starChanges.push({ uid: l.uid, isStarred: s.isStarred })
  }
  return { readChanges, starChanges, deletedUids }
}
