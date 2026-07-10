import type { AttachmentInfo, InviteData, MessageDetail, MessageInsert, MessageListItem } from '@shared/db'
import type { DB } from './database'
import { parseSearchQuery } from './searchQuery'

// Keep the FTS5 index in step with a message row (called from the write path).
function indexMessage(db: DB, id: number, subject: string | null, fromName: string | null, fromEmail: string | null, bodyText: string | null, snippet: string | null): void {
  const sender = `${fromName ?? ''} ${fromEmail ?? ''}`.trim()
  const body = `${bodyText ?? ''} ${snippet ?? ''}`.trim()
  db.run('DELETE FROM messages_fts WHERE rowid = ?', [id])
  db.run('INSERT INTO messages_fts(rowid, subject, sender, body) VALUES (?, ?, ?, ?)', [id, subject ?? '', sender, body])
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Insert or replace a message identified by (account_id, folder_id, remote_uid).
// Returns the message id. Idempotent so re-syncing a folder doesn't duplicate rows.
export function upsertMessage(db: DB, m: MessageInsert, hasAttachments = false, inviteJson: string | null = null): number {
  let id: number | undefined
  if (m.remoteUid != null && m.folderId != null) {
    const existing = db.get(
      'SELECT id FROM messages WHERE account_id = ? AND folder_id = ? AND remote_uid = ?',
      [m.accountId, m.folderId, m.remoteUid]
    ) as { id: number } | undefined
    id = existing?.id
  }

  const cols = {
    account_id: m.accountId,
    folder_id: m.folderId,
    remote_uid: m.remoteUid,
    message_id_header: m.messageIdHeader,
    from_name: m.fromName,
    from_email: m.fromEmail,
    to_json: JSON.stringify(m.to),
    cc_json: JSON.stringify(m.cc),
    bcc_json: JSON.stringify(m.bcc),
    subject: m.subject,
    snippet: m.snippet,
    body_text: m.bodyText,
    body_html: m.bodyHtml,
    received_at: m.receivedAt,
    sent_at: m.sentAt,
    is_read: m.isRead ? 1 : 0,
    is_starred: m.isStarred ? 1 : 0,
    has_attachments: hasAttachments ? 1 : 0,
    invite_json: inviteJson,
    importance: m.importance ?? null,
    list_unsubscribe: m.listUnsubscribe ?? null
  }

  if (id != null) {
    db.run(
      `UPDATE messages SET is_read = ?, is_starred = ?, snippet = ?, body_text = ?, body_html = ?,
         has_attachments = ?, invite_json = ?, updated_at = datetime('now') WHERE id = ?`,
      [cols.is_read, cols.is_starred, cols.snippet, cols.body_text, cols.body_html, cols.has_attachments, cols.invite_json, id]
    )
    indexMessage(db, id, m.subject, m.fromName, m.fromEmail, m.bodyText, m.snippet)
    return id
  }

  const keys = Object.keys(cols)
  db.run(
    `INSERT INTO messages (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    Object.values(cols) as (string | number | null)[]
  )
  const newId = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  indexMessage(db, newId, m.subject, m.fromName, m.fromEmail, m.bodyText, m.snippet)
  return newId
}

export function addAttachment(
  db: DB,
  messageId: number,
  filename: string | null,
  mimeType: string | null,
  size: number | null,
  localPath: string | null
): void {
  // Idempotent: skip if the same (message, filename, size) is already stored, so a
  // re-sync of the message doesn't append a duplicate. ponytail: metadata dedup on
  // name+size; preserves any already-downloaded local_path on the existing row.
  const dupe = db.get(
    `SELECT id FROM attachments WHERE message_id = ?
       AND COALESCE(filename,'') = COALESCE(?, '')
       AND COALESCE(size,-1)    = COALESCE(?, -1)`,
    [messageId, filename, size]
  ) as { id: number } | undefined
  if (dupe) return
  db.run(
    `INSERT INTO attachments (message_id, filename, mime_type, size, local_path, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [messageId, filename, mimeType, size, localPath, localPath ? new Date().toISOString() : null]
  )
}

export interface AttachmentRow {
  id: number
  filename: string | null
  mime_type: string | null
  size: number | null
  local_path: string | null
}

export function listAttachmentRows(db: DB, messageId: number): AttachmentRow[] {
  return db.all('SELECT id, filename, mime_type, size, local_path FROM attachments WHERE message_id = ?', [messageId]) as unknown as AttachmentRow[]
}

export function setAttachmentPath(db: DB, id: number, localPath: string): void {
  db.run("UPDATE attachments SET local_path = ?, downloaded_at = datetime('now') WHERE id = ?", [localPath, id])
}

interface MessageRow {
  id: number
  account_id: number
  folder_id: number | null
  from_name: string | null
  from_email: string | null
  subject: string | null
  snippet: string | null
  received_at: string | null
  is_read: number
  is_starred: number
  has_attachments: number
  is_pinned: number
  is_muted: number
  importance: string | null
  followup_at: string | null
}

function toListItem(r: MessageRow): MessageListItem {
  return {
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    snippet: r.snippet,
    receivedAt: r.received_at,
    isRead: !!r.is_read,
    isStarred: !!r.is_starred,
    hasAttachments: !!r.has_attachments,
    isPinned: !!r.is_pinned,
    isMuted: !!r.is_muted,
    importance: (r.importance as MessageListItem['importance']) ?? null,
    followupAt: r.followup_at ?? null
  }
}

// Map raw message rows (SELECT *) to list items — shared by ad-hoc queries
// (e.g. smart views) that build their own WHERE clause.
export function listMessageRowsToItems(rows: unknown[]): MessageListItem[] {
  return (rows as MessageRow[]).map(toListItem)
}

// Reads come straight from SQLite — so this works offline. Currently-snoozed
// messages are hidden until their snooze time passes; pinned messages float to
// the top of the folder.
export function listMessages(db: DB, folderId: number): MessageListItem[] {
  const rows = db.all(
    `SELECT * FROM messages WHERE folder_id = ?
       AND id NOT IN (SELECT message_id FROM snoozes WHERE datetime(snooze_until) > datetime('now'))
     ORDER BY is_pinned DESC, received_at DESC, id DESC`,
    [folderId]
  ) as unknown as MessageRow[]
  return rows.map(toListItem)
}

// Messages carrying a given label, newest first (pinned float up). Cross-folder.
export function listMessagesByLabel(db: DB, labelId: number): MessageListItem[] {
  const rows = db.all(
    `SELECT m.* FROM messages m
       JOIN message_labels ml ON ml.message_id = m.id
      WHERE ml.label_id = ?
      ORDER BY m.is_pinned DESC, m.received_at DESC, m.id DESC`,
    [labelId]
  ) as unknown as MessageRow[]
  return rows.map(toListItem)
}

export function getMessage(db: DB, id: number): MessageDetail | null {
  const r = db.get('SELECT * FROM messages WHERE id = ?', [id]) as unknown as
    | (MessageRow & { to_json: string | null; cc_json: string | null; bcc_json: string | null; body_text: string | null; body_html: string | null; invite_json: string | null })
    | undefined
  if (!r) return null
  const atts = db.all('SELECT id, filename, mime_type, size FROM attachments WHERE message_id = ?', [id]) as unknown as {
    id: number
    filename: string | null
    mime_type: string | null
    size: number | null
  }[]
  const attachments: AttachmentInfo[] = atts.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type, size: a.size }))
  const folderRole = r.folder_id != null
    ? (db.get('SELECT role FROM folders WHERE id = ?', [r.folder_id]) as { role: string | null } | undefined)?.role ?? null
    : null
  let invite: InviteData | null = null
  if (r.invite_json) {
    try {
      invite = JSON.parse(r.invite_json) as InviteData
    } catch {
      invite = null
    }
  }
  return {
    ...toListItem(r),
    to: parseJsonArray(r.to_json),
    cc: parseJsonArray(r.cc_json),
    bcc: parseJsonArray(r.bcc_json),
    bodyText: r.body_text,
    bodyHtml: r.body_html,
    attachments,
    invite,
    folderRole
  }
}

// Full-text search over the FTS5 index, with operators (from:/subject:/body:,
// has:attachment, is:unread|read, before:/after:). Falls back to a LIKE scan if
// the FTS MATCH can't be parsed, so a stray character never breaks search.
export function searchMessages(db: DB, query: string, limit = 200): MessageListItem[] {
  if (!query.trim()) return []
  const p = parseSearchQuery(query)
  const where: string[] = []
  const params: (string | number)[] = []
  if (p.fts) {
    where.push('m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)')
    params.push(p.fts)
  }
  if (p.hasAttachment) where.push('m.has_attachments = 1')
  if (p.unread === true) where.push('m.is_read = 0')
  if (p.unread === false) where.push('m.is_read = 1')
  if (p.before) { where.push('m.received_at < ?'); params.push(p.before) }
  if (p.after) { where.push('m.received_at >= ?'); params.push(p.after) }
  if (where.length === 0) return []

  try {
    const rows = db.all(
      `SELECT m.* FROM messages m WHERE ${where.join(' AND ')} ORDER BY m.is_pinned DESC, m.received_at DESC, m.id DESC LIMIT ?`,
      [...params, limit]
    ) as unknown as MessageRow[]
    return rows.map(toListItem)
  } catch {
    return searchMessagesLike(db, query, limit) // malformed FTS expression → scan
  }
}

// LIKE fallback (also the pre-FTS behaviour). Each term must match somewhere (AND).
function searchMessagesLike(db: DB, query: string, limit: number): MessageListItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const clause = terms
    .map(() => '(LOWER(subject) LIKE ? OR LOWER(from_name) LIKE ? OR LOWER(from_email) LIKE ? OR LOWER(snippet) LIKE ? OR LOWER(body_text) LIKE ?)')
    .join(' AND ')
  const params = terms.flatMap((t) => Array<string>(5).fill(`%${t}%`))
  const rows = db.all(
    `SELECT * FROM messages WHERE ${clause} ORDER BY received_at DESC, id DESC LIMIT ?`,
    [...params, limit]
  ) as unknown as MessageRow[]
  return rows.map(toListItem)
}

export interface SearchEmailsOpts {
  query?: string
  accountId?: number
  folderId?: number
  dateFrom?: string
  dateTo?: string
  unreadOnly?: boolean
  hasAttachments?: boolean
  limit?: number
}

// Filtered search used by the MCP search_emails tool.
export function searchEmails(db: DB, opts: SearchEmailsOpts): MessageListItem[] {
  const where: string[] = []
  const params: (string | number)[] = []

  for (const t of (opts.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    where.push('(LOWER(subject) LIKE ? OR LOWER(from_name) LIKE ? OR LOWER(from_email) LIKE ? OR LOWER(snippet) LIKE ? OR LOWER(body_text) LIKE ?)')
    params.push(...Array<string>(5).fill(`%${t}%`))
  }
  if (opts.accountId != null) { where.push('account_id = ?'); params.push(opts.accountId) }
  if (opts.folderId != null) { where.push('folder_id = ?'); params.push(opts.folderId) }
  if (opts.dateFrom) { where.push('received_at >= ?'); params.push(opts.dateFrom) }
  if (opts.dateTo) { where.push('received_at <= ?'); params.push(opts.dateTo) }
  if (opts.unreadOnly) where.push('is_read = 0')
  if (opts.hasAttachments) where.push('has_attachments = 1')

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200)
  const rows = db.all(
    `SELECT * FROM messages ${clause} ORDER BY received_at DESC, id DESC LIMIT ?`,
    [...params, limit]
  ) as unknown as MessageRow[]
  return rows.map(toListItem)
}

export function markRead(db: DB, id: number, read = true): void {
  db.run("UPDATE messages SET is_read = ?, updated_at = datetime('now') WHERE id = ?", [read ? 1 : 0, id])
}

// Mark every unread message in a folder as read (local only). Returns how many changed.
export function markFolderRead(db: DB, folderId: number): number {
  const n = (db.get('SELECT COUNT(*) c FROM messages WHERE folder_id = ? AND is_read = 0', [folderId]) as { c: number }).c
  db.run("UPDATE messages SET is_read = 1, updated_at = datetime('now') WHERE folder_id = ? AND is_read = 0", [folderId])
  return n
}

// Remove a message row from the local cache (used by permanent delete).
export function deleteMessage(db: DB, id: number): void {
  db.run('DELETE FROM messages WHERE id = ?', [id])
}

// Ids of every message currently in a folder (used by "empty folder").
export function folderMessageIds(db: DB, folderId: number): number[] {
  return (db.all('SELECT id FROM messages WHERE folder_id = ?', [folderId]) as unknown as { id: number }[]).map((r) => r.id)
}

// Set (or clear, with null) a "follow up by" date on a message. Surfaced in Today.
export function setFollowup(db: DB, id: number, iso: string | null): void {
  db.run("UPDATE messages SET followup_at = ?, updated_at = datetime('now') WHERE id = ?", [iso, id])
}

export function setStarred(db: DB, id: number, on: boolean): void {
  db.run("UPDATE messages SET is_starred = ?, updated_at = datetime('now') WHERE id = ?", [on ? 1 : 0, id])
}

export function setMessageFolder(db: DB, id: number, folderId: number): void {
  db.run("UPDATE messages SET folder_id = ?, updated_at = datetime('now') WHERE id = ?", [folderId, id])
}

// Local-only flags (no IMAP equivalent). Muting also marks the message read so a
// muted thread stops nagging in unread counts and the Today view.
export function setPinned(db: DB, id: number, on: boolean): void {
  db.run("UPDATE messages SET is_pinned = ?, updated_at = datetime('now') WHERE id = ?", [on ? 1 : 0, id])
}
export function setMuted(db: DB, id: number, on: boolean): void {
  db.run("UPDATE messages SET is_muted = ?, is_read = CASE WHEN ? THEN 1 ELSE is_read END, updated_at = datetime('now') WHERE id = ?", [on ? 1 : 0, on ? 1 : 0, id])
}

// Minimal row for resolving IMAP write-back (source folder + remote uid).
// Previous/next message ids in the same folder, in the list's display order —
// so a pop-out window can step through the folder. null at the ends.
export function messageNeighbours(db: DB, id: number): { prevId: number | null; nextId: number | null } {
  const meta = getMessageMeta(db, id)
  if (!meta || meta.folderId == null) return { prevId: null, nextId: null }
  const rows = db.all(
    `SELECT id FROM messages WHERE folder_id = ?
       AND id NOT IN (SELECT message_id FROM snoozes WHERE datetime(snooze_until) > datetime('now'))
     ORDER BY is_pinned DESC, received_at DESC, id DESC`,
    [meta.folderId]
  ) as unknown as { id: number }[]
  const idx = rows.findIndex((r) => r.id === id)
  if (idx < 0) return { prevId: null, nextId: null }
  return {
    prevId: idx > 0 ? rows[idx - 1].id : null,
    nextId: idx < rows.length - 1 ? rows[idx + 1].id : null
  }
}

export function getMessageMeta(db: DB, id: number): { accountId: number; folderId: number | null; remoteUid: number | null } | null {
  const r = db.get('SELECT account_id, folder_id, remote_uid FROM messages WHERE id = ?', [id]) as
    | { account_id: number; folder_id: number | null; remote_uid: number | null }
    | undefined
  return r ? { accountId: r.account_id, folderId: r.folder_id, remoteUid: r.remote_uid } : null
}
