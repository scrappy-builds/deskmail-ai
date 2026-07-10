import type { AttachmentBrowserItem, AttachmentInfo, InviteData, MessageDetail, MessageInsert, MessageListItem } from '@shared/db'
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
    list_unsubscribe: m.listUnsubscribe ?? null,
    reply_to: m.replyTo ?? null
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

// All messages across every account's Inbox — the "unified inbox" view.
export function listUnifiedInbox(db: DB): MessageListItem[] {
  const rows = db.all(
    `SELECT * FROM messages
       WHERE folder_id IN (SELECT id FROM folders WHERE role = 'inbox')
         AND id NOT IN (SELECT message_id FROM snoozes WHERE datetime(snooze_until) > datetime('now'))
     ORDER BY is_pinned DESC, received_at DESC, id DESC
     LIMIT 500`
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
    | (MessageRow & { to_json: string | null; cc_json: string | null; bcc_json: string | null; body_text: string | null; body_html: string | null; invite_json: string | null; list_unsubscribe: string | null; reply_to: string | null })
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
    folderRole,
    listUnsubscribe: r.list_unsubscribe ?? null,
    replyTo: r.reply_to ?? null
  }
}

// How many messages we already hold from this sender (any folder), excluding
// the one being viewed — the "first contact" signal.
export function countFromSender(db: DB, email: string, excludeId: number): number {
  return (
    db.get('SELECT COUNT(*) c FROM messages WHERE LOWER(from_email) = LOWER(?) AND id != ?', [email, excludeId]) as { c: number }
  ).c
}

// Every domain that appears anywhere in mail history (senders and recipients)
// — the compose "first email to <domain>" check treats these as familiar.
export function allKnownDomains(db: DB): string[] {
  const senders = db.all(
    "SELECT DISTINCT LOWER(SUBSTR(from_email, INSTR(from_email, '@') + 1)) d FROM messages WHERE from_email LIKE '%@%'"
  ) as unknown as { d: string }[]
  const out = new Set(senders.map((r) => r.d))
  // Recipient domains from stored to_json (covers sent mail once it's cached).
  const rows = db.all("SELECT to_json FROM messages WHERE to_json IS NOT NULL AND to_json != '[]'") as unknown as { to_json: string }[]
  for (const r of rows) {
    for (const addr of parseJsonArray(r.to_json)) {
      const at = addr.lastIndexOf('@')
      if (at > 0) out.add(addr.slice(at + 1).toLowerCase())
    }
  }
  return [...out]
}

// The domains that email me most (min 3 messages) — lookalike comparison targets.
export function topSenderDomains(db: DB, limit = 10): string[] {
  const rows = db.all(
    `SELECT LOWER(SUBSTR(from_email, INSTR(from_email, '@') + 1)) d, COUNT(*) c
       FROM messages WHERE from_email LIKE '%@%'
      GROUP BY d HAVING c >= 3 ORDER BY c DESC LIMIT ?`,
    [limit]
  ) as unknown as { d: string }[]
  return rows.map((r) => r.d)
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

// --- All-attachments browser ----------------------------------------------------
// Every attachment across the mailbox, newest message first, filterable by
// filename or sender, paged (100/page) so a big store stays snappy.
export function listAllAttachments(db: DB, opts: { query?: string; limit?: number; offset?: number } = {}): AttachmentBrowserItem[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const offset = Math.max(opts.offset ?? 0, 0)
  const where: string[] = ['a.filename IS NOT NULL']
  const params: (string | number)[] = []
  const q = opts.query?.trim().toLowerCase()
  if (q) {
    where.push('(LOWER(a.filename) LIKE ? OR LOWER(m.from_name) LIKE ? OR LOWER(m.from_email) LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  const rows = db.all(
    `SELECT a.id attachment_id, a.message_id, a.filename, a.mime_type, a.size, a.local_path,
            m.from_name, m.from_email, m.subject, m.received_at
       FROM attachments a JOIN messages m ON m.id = a.message_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.received_at DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  ) as unknown as {
    attachment_id: number
    message_id: number
    filename: string | null
    mime_type: string | null
    size: number | null
    local_path: string | null
    from_name: string | null
    from_email: string | null
    subject: string | null
    received_at: string | null
  }[]
  return rows.map((r) => ({
    attachmentId: r.attachment_id,
    messageId: r.message_id,
    filename: r.filename,
    mimeType: r.mime_type,
    size: r.size,
    downloaded: !!r.local_path,
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    receivedAt: r.received_at
  }))
}

// --- Duplicate cleanup (one-off tool in Settings → Local storage) -------------
// Exact duplicates only: same account, same folder, same non-null Message-ID
// header — the leftovers of a re-imported mbox. Grouping includes the folder on
// purpose: the same Message-ID legitimately lives in both Sent and Inbox for
// self-addressed mail, and that must never be "cleaned up". No fuzzy matching.
const DUPE_GROUP = "message_id_header IS NOT NULL GROUP BY account_id, COALESCE(folder_id,-1), message_id_header"

export function countDuplicateMessages(db: DB): number {
  const total = (db.get('SELECT COUNT(*) c FROM messages WHERE message_id_header IS NOT NULL') as { c: number }).c
  const groups = (db.get(`SELECT COUNT(*) c FROM (SELECT 1 FROM messages WHERE ${DUPE_GROUP})`) as { c: number }).c
  return total - groups
}

// Keep the earliest row of each duplicate group, delete the rest (attachments
// cascade). Returns how many rows were removed; folder counts are refreshed.
export function dedupeMessages(db: DB): { removed: number } {
  const removed = countDuplicateMessages(db)
  if (removed === 0) return { removed }
  db.run(`DELETE FROM messages WHERE message_id_header IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM messages WHERE ${DUPE_GROUP})`)
  // Drop orphaned full-text rows so search stops returning ghosts.
  db.run('DELETE FROM messages_fts WHERE rowid NOT IN (SELECT id FROM messages)')
  const folders = db.all('SELECT id FROM folders') as unknown as { id: number }[]
  for (const f of folders) {
    db.run(
      `UPDATE folders SET
         total_count  = (SELECT COUNT(*) FROM messages WHERE folder_id = ?),
         unread_count = (SELECT COUNT(*) FROM messages WHERE folder_id = ? AND is_read = 0)
       WHERE id = ?`,
      [f.id, f.id, f.id]
    )
  }
  return { removed }
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
