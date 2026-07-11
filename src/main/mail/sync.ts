import type { ImapFlow, FetchMessageObject } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { withConnection } from './connectionPool'
import { ensureStandardFolders, findFolderByRole, getFolder, refreshFolderCounts, upsertFolder } from '../../db/folders'
import { dedupeAppendedSent, deleteFolderMessages } from '../../db/messages'
import { getAppSetting } from '../../db/settings'
import { ingestRaw } from './ingest'
import { applyJunkIfSpam } from './junk'
import { applyFocusClassification } from './focus'
import { applyRulesToMessage } from '../../db/rules'
import {
  backfillWindow,
  depthCutoffIso,
  diffFlags,
  getFolderCursor,
  setCursorHigh,
  setCursorLow,
  uidValidityChanged,
  wipeFolderCursor,
  type ServerFlag
} from '../../db/folderSync'

// Newest page seeded on a folder's first sync (keeps first sync quick); older
// mail arrives via back-fill. Back-fill pulls this many per page.
const SEED_PAGE = 50
const BACKFILL_PAGE = 200
// Newest N UIDs per folder to reconcile flags over (read/starred + deletions).
const RECONCILE_WINDOW = 500

// Guess a folder's role from IMAP special-use flags or its name.
function folderRole(path: string, specialUse?: string): string | null {
  const su = specialUse?.replace('\\', '').toLowerCase()
  if (su) return su // 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | ...
  const p = path.toLowerCase()
  if (p === 'inbox') return 'inbox'
  return null
}

export type SyncResult = { ok: true } | { ok: false; error: string }

// History-depth setting (days). 0 = everything; default 365.
function depthDays(db: DB): number {
  return Number(getAppSetting(db, 'sync-depth-days') ?? '365')
}

interface MailboxStatus {
  uidValidity: number
  uidNext: number
  exists: number
}
function mailboxStatus(client: ImapFlow): MailboxStatus | null {
  const mb = client.mailbox
  if (!mb || typeof mb === 'boolean') return null
  return { uidValidity: Number(mb.uidValidity), uidNext: Number(mb.uidNext), exists: mb.exists }
}

// Ingest one fetched message, then — inbox only — run the junk/rules/focus
// pipeline (Sent must never be junk-filtered). Returns the stored id, or null.
async function ingestOne(
  db: DB,
  accountId: number,
  folderId: number,
  role: string | null,
  msg: FetchMessageObject,
  myEmails: string[],
  junkEnabled: boolean
): Promise<number | null> {
  if (!msg.source) return null
  const id = await ingestRaw(
    db,
    {
      accountId,
      folderId,
      remoteUid: msg.uid,
      isRead: msg.flags?.has('\\Seen') ?? false,
      isStarred: msg.flags?.has('\\Flagged') ?? false
    },
    msg.source
  )
  if (role === 'inbox') {
    applyJunkIfSpam(db, id, junkEnabled)
    applyRulesToMessage(db, id)
    applyFocusClassification(db, id, myEmails)
  }
  return id
}

// Reconcile flags over the newest window: pull read/starred changes made
// elsewhere back into the cache, and treat any local UID the server no longer
// lists as deleted → move it to the local Trash. Cheap (flags only, no bodies)
// and keeps two-way state honest without QRESYNC. The caller holds the lock.
async function reconcileFlags(db: DB, accountId: number, client: ImapFlow, folderId: number, role: string | null): Promise<void> {
  const cursor = getFolderCursor(db, folderId)
  if (!cursor || cursor.lastSeenUid <= 0) return
  const lo = Math.max(1, cursor.lastSeenUid - (RECONCILE_WINDOW - 1))
  const locals = db.all(
    'SELECT id, remote_uid uid, is_read, is_starred FROM messages WHERE folder_id = ? AND remote_uid IS NOT NULL AND remote_uid >= ?',
    [folderId, lo]
  ) as unknown as { id: number; uid: number; is_read: number; is_starred: number }[]
  if (locals.length === 0) return

  const server = new Map<number, ServerFlag>()
  for await (const msg of client.fetch(`${lo}:*`, { uid: true, flags: true }, { uid: true })) {
    server.set(msg.uid, { isRead: msg.flags?.has('\\Seen') ?? false, isStarred: msg.flags?.has('\\Flagged') ?? false })
  }

  const diff = diffFlags(locals.map((l) => ({ uid: l.uid, isRead: !!l.is_read, isStarred: !!l.is_starred })), server)
  const idByUid = new Map(locals.map((l) => [l.uid, l.id]))
  for (const c of diff.readChanges) db.run('UPDATE messages SET is_read = ? WHERE id = ?', [c.isRead ? 1 : 0, idByUid.get(c.uid) as number])
  for (const c of diff.starChanges) db.run('UPDATE messages SET is_starred = ? WHERE id = ?', [c.isStarred ? 1 : 0, idByUid.get(c.uid) as number])

  // Server-side deletions → local Trash (but never re-trash the Trash itself).
  if (role !== 'trash' && diff.deletedUids.length > 0) {
    const trash = findFolderByRole(db, accountId, 'trash')
    if (trash) {
      for (const uid of diff.deletedUids) db.run('UPDATE messages SET folder_id = ? WHERE id = ?', [trash.id, idByUid.get(uid) as number])
      refreshFolderCounts(db, trash.id)
    }
  }
}

// Sync one folder: seed its newest page on first contact, otherwise pull only
// mail newer than the cursor. Handles a UIDVALIDITY reset by wiping the stale
// cache. Back-fill of older mail is separate (backfillFolder).
async function syncFolder(
  db: DB,
  accountId: number,
  client: ImapFlow,
  folderId: number,
  remotePath: string,
  role: string | null,
  myEmails: string[],
  junkEnabled: boolean
): Promise<void> {
  // The pooled connection is kept alive between cycles, and imapflow won't
  // re-SELECT a mailbox it already thinks is current — so its cached view
  // (uidNext/exists, and how a `*` range resolves) can be stale and hide mail
  // that arrived since it was last selected. Force a fresh SELECT by closing it
  // first if it's the currently-open mailbox, so incremental sync always sees
  // new mail. Cheap: one extra SELECT only when this mailbox was already open.
  const open = client.mailbox
  if (open && typeof open !== 'boolean' && open.path === remotePath) {
    await client.mailboxClose()
  }
  const lock = await client.getMailboxLock(remotePath)
  try {
    const status = mailboxStatus(client)
    if (!status) return
    let cursor = getFolderCursor(db, folderId)

    // UIDVALIDITY changed → cached UIDs are meaningless; start this folder fresh.
    if (uidValidityChanged(cursor?.uidValidity ?? null, status.uidValidity)) {
      deleteFolderMessages(db, folderId)
      wipeFolderCursor(db, folderId)
      cursor = null
    }

    const wasFresh = cursor == null
    if (cursor == null) {
      // First sync: seed the newest SEED_PAGE messages (by sequence number).
      if (status.exists > 0) {
        const start = Math.max(1, status.exists - (SEED_PAGE - 1))
        let maxUid = 0
        let minUid = Number.POSITIVE_INFINITY
        for await (const msg of client.fetch(`${start}:*`, { uid: true, flags: true, source: true })) {
          const id = await ingestOne(db, accountId, folderId, role, msg, myEmails, junkEnabled)
          if (id == null) continue
          if (msg.uid > maxUid) maxUid = msg.uid
          if (msg.uid < minUid) minUid = msg.uid
        }
        if (maxUid > 0) setCursorHigh(db, folderId, status.uidValidity, maxUid, minUid === Number.POSITIVE_INFINITY ? null : minUid)
      } else {
        // Empty folder — still record the cursor so we don't seed it every run.
        setCursorHigh(db, folderId, status.uidValidity, 0, null)
      }
    } else if (status.uidNext - 1 > cursor.lastSeenUid) {
      // Incremental: fetch mail newer than the high-water mark (by UID). uidNext
      // is trustworthy here because of the forced fresh SELECT above.
      let maxUid = cursor.lastSeenUid
      for await (const msg of client.fetch(`${cursor.lastSeenUid + 1}:*`, { uid: true, flags: true, source: true }, { uid: true })) {
        if (msg.uid <= cursor.lastSeenUid) continue // guard the N:* quirk (an old message when none are newer)
        const id = await ingestOne(db, accountId, folderId, role, msg, myEmails, junkEnabled)
        if (id == null) continue
        if (msg.uid > maxUid) maxUid = msg.uid
      }
      if (maxUid > cursor.lastSeenUid) setCursorHigh(db, folderId, status.uidValidity, maxUid)
    }

    // Reconcile flags/deletions on established folders (skip the fresh seed —
    // its flags are already current and first sync stays fast).
    if (!wasFresh) await reconcileFlags(db, accountId, client, folderId, role)

    // Once the real Sent copies land, drop the locally-appended duplicates.
    if (role === 'sent') dedupeAppendedSent(db, folderId)
    refreshFolderCounts(db, folderId)
  } finally {
    lock.release()
  }
}

// Sync one account: refresh the folder list, then sync every folder (skipping
// Drafts — local drafts are authoritative). Runs off the UI thread.
export async function syncAccount(db: DB, accountId: number): Promise<SyncResult> {
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
  if (!acc) return { ok: false, error: 'Account not found.' }
  ensureStandardFolders(db, accountId)
  if (acc.incoming_type !== 'imap') {
    // ponytail: POP3 sync is optional (plan 25, parked) — IMAP first.
    return { ok: false, error: 'Only IMAP sync is supported so far.' }
  }

  try {
    const junkEnabled = getAppSetting(db, 'junk-filter') !== 'off'
    const myEmails = (db.all('SELECT email_address e FROM accounts') as unknown as { e: string }[]).map((r) => r.e)
    let firstFolderId: number | null = null

    await withConnection(db, accountId, async (client) => {
      // Refresh the folder list first, collecting what to sync.
      const toSync: { id: number; path: string; role: string | null }[] = []
      for (const box of await client.list()) {
        const role = folderRole(box.path, box.specialUse)
        const id = upsertFolder(db, accountId, box.name, role, box.path)
        if (firstFolderId == null || box.path.toLowerCase() === 'inbox') firstFolderId = id
        if (role !== 'drafts') toSync.push({ id, path: box.path, role })
      }
      // Inbox first (fast, most-wanted), then the rest.
      toSync.sort((a, b) => (a.role === 'inbox' ? -1 : b.role === 'inbox' ? 1 : 0))
      for (const f of toSync) {
        await syncFolder(db, accountId, client, f.id, f.path, f.role, myEmails, junkEnabled)
      }
    })
    recordSyncState(db, accountId, firstFolderId, 'ok', null)
    return { ok: true }
  } catch (err) {
    const error = (err as Error).message ?? 'Sync failed.'
    recordSyncState(db, accountId, null, 'error', error)
    return { ok: false, error }
  }
}

// Fetch one older page for a folder (the "Load older" button + background
// back-fill after first sync). Respects the history-depth cutoff. Returns how
// many messages it added (0 when there's nothing left or depth is reached).
export async function backfillFolder(db: DB, accountId: number, folderId: number): Promise<number> {
  const folder = getFolder(db, folderId)
  if (!folder?.remote_path || folder.role === 'drafts') return 0
  const cursor = getFolderCursor(db, folderId)
  const win = backfillWindow(cursor?.backfillLowUid ?? null, BACKFILL_PAGE)
  if (!win) return 0

  const cutoff = depthCutoffIso(depthDays(db))
  const junkEnabled = getAppSetting(db, 'junk-filter') !== 'off'
  const myEmails = (db.all('SELECT email_address e FROM accounts') as unknown as { e: string }[]).map((r) => r.e)
  let added = 0
  let reachedDepth = false

  await withConnection(db, accountId, async (client) => {
    const lock = await client.getMailboxLock(folder.remote_path as string)
    try {
      for await (const msg of client.fetch(`${win.low}:${win.high}`, { uid: true, flags: true, source: true, internalDate: true }, { uid: true })) {
        // Depth cutoff: skip mail older than the window and stop back-filling.
        const internal = msg.internalDate ? new Date(msg.internalDate).toISOString() : null
        if (cutoff && internal && internal < cutoff) {
          reachedDepth = true
          continue
        }
        const id = await ingestOne(db, accountId, folderId, folder.role, msg, myEmails, junkEnabled)
        if (id != null) added++
      }
      // Lower the floor to this page's bottom, or to 1 (done) if depth is hit.
      setCursorLow(db, folderId, reachedDepth ? 1 : win.low)
    } finally {
      lock.release()
    }
  })
  refreshFolderCounts(db, folderId)
  return added
}

// True while a folder still has older mail to pull (drives the "Load older"
// button and the background back-fill loop).
export function canBackfill(db: DB, folderId: number): boolean {
  const cursor = getFolderCursor(db, folderId)
  return backfillWindow(cursor?.backfillLowUid ?? null, BACKFILL_PAGE) != null
}

function recordSyncState(db: DB, accountId: number, folderId: number | null, status: string, error: string | null): void {
  db.run(
    `INSERT INTO sync_state (account_id, folder_id, last_sync_at, sync_status, sync_error)
     VALUES (?, ?, datetime('now'), ?, ?)`,
    [accountId, folderId, status, error]
  )
}

// skip lets the caller leave out accounts that don't need polling right now
// (e.g. ones with a healthy IMAP IDLE connection pushing new mail already).
export async function syncAllAccounts(db: DB, skip?: (accountId: number) => boolean): Promise<void> {
  const rows = db.all("SELECT id FROM accounts WHERE incoming_type = 'imap'") as unknown as { id: number }[]
  for (const r of rows) {
    if (skip?.(r.id)) continue
    await syncAccount(db, r.id)
  }
}

// Back-fill every folder of an account to the history-depth limit, one page at a
// time, in the background after the initial fast seed. Bounded so a runaway
// server can't loop forever.
export async function backfillAccount(db: DB, accountId: number, maxPages = 200, onPage?: () => void): Promise<void> {
  const folders = db.all("SELECT id FROM folders WHERE account_id = ? AND role IS NOT 'drafts'", [accountId]) as unknown as { id: number }[]
  for (const f of folders) {
    let pages = 0
    while (canBackfill(db, f.id) && pages < maxPages) {
      const added = await backfillFolder(db, accountId, f.id)
      pages++
      onPage?.()
      if (added === 0) break // depth reached or nothing there
    }
  }
}
