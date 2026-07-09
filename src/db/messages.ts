import type { AttachmentInfo, InviteData, MessageDetail, MessageInsert, MessageListItem } from '@shared/db'
import type { DB } from './database'

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
    invite_json: inviteJson
  }

  if (id != null) {
    db.run(
      `UPDATE messages SET is_read = ?, is_starred = ?, snippet = ?, body_text = ?, body_html = ?,
         has_attachments = ?, invite_json = ?, updated_at = datetime('now') WHERE id = ?`,
      [cols.is_read, cols.is_starred, cols.snippet, cols.body_text, cols.body_html, cols.has_attachments, cols.invite_json, id]
    )
    return id
  }

  const keys = Object.keys(cols)
  db.run(
    `INSERT INTO messages (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    Object.values(cols) as (string | number | null)[]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function addAttachment(
  db: DB,
  messageId: number,
  filename: string | null,
  mimeType: string | null,
  size: number | null,
  localPath: string | null
): void {
  db.run(
    `INSERT INTO attachments (message_id, filename, mime_type, size, local_path, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [messageId, filename, mimeType, size, localPath, localPath ? new Date().toISOString() : null]
  )
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
    hasAttachments: !!r.has_attachments
  }
}

// Reads come straight from SQLite — so this works offline.
export function listMessages(db: DB, folderId: number): MessageListItem[] {
  const rows = db.all(
    'SELECT * FROM messages WHERE folder_id = ? ORDER BY received_at DESC, id DESC',
    [folderId]
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
    invite
  }
}

// Local full-text-ish search across the cached messages. Each whitespace term
// must match somewhere (AND); matching is substring across the useful fields.
// ponytail: LIKE scan over the local cache — fine for one person's mailbox;
// swap for FTS5 if it ever feels slow.
export function searchMessages(db: DB, query: string, limit = 200): MessageListItem[] {
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

export function markRead(db: DB, id: number, read = true): void {
  db.run("UPDATE messages SET is_read = ?, updated_at = datetime('now') WHERE id = ?", [read ? 1 : 0, id])
}
