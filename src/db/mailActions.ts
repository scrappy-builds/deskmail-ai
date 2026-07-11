import {
  findFolderByRole,
  ensureRoleFolder,
  getFolder,
  refreshFolderCounts
} from './folders'
import { deleteMessage, folderMessageIds, getMessageMeta, markRead, setMessageFolder, setStarred } from './messages'
import type { MailOp } from '@shared/db'
import type { DB } from './database'

export type { MailOp }

const ROLE_FOR: Partial<Record<MailOp, { role: string; name: string }>> = {
  trash: { role: 'trash', name: 'Trash' },
  junk: { role: 'junk', name: 'Junk' },
  archive: { role: 'archive', name: 'Archive' }
}

export interface QueuedAction {
  id: number
  message_id: number | null
  account_id: number
  op: MailOp | 'append' | 'empty'
  remote_uid: number | null
  source_path: string | null
  target_path: string | null
}

// Queue an IMAP APPEND retry (Sent-folder copy that couldn't reach the server).
// source_path = spool file holding the raw message; target_path = the mailbox.
export function queueAppend(db: DB, accountId: number, spoolPath: string, targetPath: string): void {
  db.run(
    `INSERT INTO mail_actions (message_id, account_id, op, remote_uid, source_path, target_path)
     VALUES (NULL, ?, 'append', NULL, ?, ?)`,
    [accountId, spoolPath, targetPath]
  )
}

// Apply a mail action: mutate the local cache immediately (snappy UI) and queue
// the equivalent IMAP operation for the background drainer to push to the server.
// Used by in-app actions, the junk filter, and the Claude MCP tools alike.
export function applyAction(db: DB, messageId: number, op: MailOp, explicitTargetFolderId?: number): boolean {
  const meta = getMessageMeta(db, messageId)
  if (!meta) return false

  const source = meta.folderId != null ? getFolder(db, meta.folderId) : null

  // Permanent delete: queue a server expunge (drainer uses source_path + uid, so
  // it still works after the local row is gone), then drop the local copy.
  if (op === 'delete-forever') {
    db.run(
      `INSERT INTO mail_actions (message_id, account_id, op, remote_uid, source_path, target_path)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [messageId, meta.accountId, op, meta.remoteUid, source?.remote_path ?? null]
    )
    deleteMessage(db, messageId)
    if (source) refreshFolderCounts(db, source.id)
    return true
  }

  // Resolve a target folder for the move-like ops.
  let targetPath: string | null = null
  let targetFolderId: number | undefined = explicitTargetFolderId
  if (op === 'move') {
    if (explicitTargetFolderId == null) return false
    targetPath = getFolder(db, explicitTargetFolderId)?.remote_path ?? null
  } else if (ROLE_FOR[op]) {
    const { role, name } = ROLE_FOR[op]!
    const folder = findFolderByRole(db, meta.accountId, role) ?? ensureRoleFolder(db, meta.accountId, role, name)
    targetFolderId = folder.id
    targetPath = folder.remote_path
  }

  // Local mutation.
  switch (op) {
    case 'flag':
      setStarred(db, messageId, true)
      break
    case 'unflag':
      setStarred(db, messageId, false)
      break
    case 'read':
      markRead(db, messageId, true)
      break
    case 'unread':
      markRead(db, messageId, false)
      break
    default: // move | trash | junk | archive
      if (targetFolderId != null) setMessageFolder(db, messageId, targetFolderId)
  }

  db.run(
    `INSERT INTO mail_actions (message_id, account_id, op, remote_uid, source_path, target_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [messageId, meta.accountId, op, meta.remoteUid, source?.remote_path ?? null, targetPath]
  )

  // Keep folder counts fresh.
  if (source) refreshFolderCounts(db, source.id)
  if (targetFolderId != null) refreshFolderCounts(db, targetFolderId)
  return true
}

// Empty a folder (Empty Trash / Empty Junk). Queues a single server-side expunge
// of the WHOLE mailbox — robust because it doesn't depend on any per-message UID,
// which can go stale after a message was moved into the folder (a moved message
// keeps its old source-folder UID locally until the next sync). Then drops the
// local rows. Returns how many local messages were removed.
export function emptyFolder(db: DB, folderId: number): number {
  const folder = getFolder(db, folderId)
  const ids = folderMessageIds(db, folderId)
  if (folder?.remote_path) {
    db.run(
      `INSERT INTO mail_actions (message_id, account_id, op, remote_uid, source_path, target_path)
       VALUES (NULL, ?, 'empty', NULL, ?, NULL)`,
      [folder.account_id, folder.remote_path]
    )
  }
  for (const id of ids) deleteMessage(db, id)
  if (folder) refreshFolderCounts(db, folderId)
  return ids.length
}

export function pendingActions(db: DB): QueuedAction[] {
  return db.all("SELECT id, message_id, account_id, op, remote_uid, source_path, target_path FROM mail_actions WHERE status = 'pending' ORDER BY id") as unknown as QueuedAction[]
}

export function markActionDone(db: DB, id: number): void {
  db.run("UPDATE mail_actions SET status = 'done' WHERE id = ?", [id])
}

export function markActionError(db: DB, id: number, error: string): void {
  db.run("UPDATE mail_actions SET status = 'error', error = ? WHERE id = ?", [error, id])
}
