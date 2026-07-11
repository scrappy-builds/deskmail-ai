import type { FolderSummary } from '@shared/db'
import type { DB } from './database'

// Upsert a folder by (account_id, remote_path); returns its id. Keeps counts fresh.
export function upsertFolder(
  db: DB,
  accountId: number,
  name: string,
  role: string | null,
  remotePath: string
): number {
  const existing = db.get(
    'SELECT id FROM folders WHERE account_id = ? AND remote_path = ?',
    [accountId, remotePath]
  ) as { id: number } | undefined
  if (existing) {
    db.run('UPDATE folders SET name = ?, role = ? WHERE id = ?', [name, role, existing.id])
    return existing.id
  }
  // A standard role maps to exactly one mailbox. If a row for this role already
  // exists (typically the pre-sync placeholder, whose remote_path is a bare
  // 'Sent'/'Trash'/… ), adopt it and point it at the real server path — rather
  // than inserting a duplicate. This is what keeps prefixed-namespace servers
  // (Dovecot's 'INBOX.Sent', the cPanel default) from spawning two 'sent' rows
  // and making findFolderByRole resolve to the empty placeholder.
  // ponytail: assumes one folder per role; a server reporting two same-role
  // mailboxes (e.g. Gmail's label model) would collapse them — revisit if we add
  // Gmail label support.
  if (role) {
    const byRole = db.get(
      'SELECT id FROM folders WHERE account_id = ? AND role = ?',
      [accountId, role]
    ) as { id: number } | undefined
    if (byRole) {
      db.run('UPDATE folders SET name = ?, remote_path = ? WHERE id = ?', [name, remotePath, byRole.id])
      return byRole.id
    }
  }
  db.run(
    'INSERT INTO folders (account_id, name, role, remote_path) VALUES (?, ?, ?, ?)',
    [accountId, name, role, remotePath]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

interface FolderRow {
  id: number
  account_id: number
  name: string
  role: string | null
  remote_path: string | null
  parent_id: number | null
}

export function findFolderByRole(db: DB, accountId: number, role: string): FolderRow | null {
  const r = db.get('SELECT id, account_id, name, role, remote_path, parent_id FROM folders WHERE account_id = ? AND role = ? LIMIT 1', [accountId, role]) as unknown as FolderRow | undefined
  return r ?? null
}

export function getFolder(db: DB, id: number): FolderRow | null {
  const r = db.get('SELECT id, account_id, name, role, remote_path, parent_id FROM folders WHERE id = ?', [id]) as unknown as FolderRow | undefined
  return r ?? null
}

// Ensure a role folder exists locally; create a placeholder if missing so an
// action always has a target. The IMAP drainer creates the mailbox server-side.
export function ensureRoleFolder(db: DB, accountId: number, role: string, name: string): FolderRow {
  const existing = findFolderByRole(db, accountId, role)
  if (existing) return existing
  const id = upsertFolder(db, accountId, name, role, name)
  return { id, account_id: accountId, name, role, remote_path: name, parent_id: null }
}

// The familiar mailboxes, in display order. Standard roles sort ahead of any
// custom folder (which has role === null and sorts by name below them).
export const ROLE_ORDER: Record<string, number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  junk: 3,
  trash: 4,
  archive: 5
}
const STANDARD: { role: string; name: string; remote: string }[] = [
  { role: 'inbox', name: 'Inbox', remote: 'INBOX' },
  { role: 'drafts', name: 'Drafts', remote: 'Drafts' },
  { role: 'sent', name: 'Sent', remote: 'Sent' },
  { role: 'junk', name: 'Junk', remote: 'Junk' },
  { role: 'trash', name: 'Trash', remote: 'Trash' },
  { role: 'archive', name: 'Archive', remote: 'Archive' }
]

// Make sure the familiar mailboxes exist locally so the sidebar shows a full
// folder tree even before the first successful sync creates them. Idempotent.
// When the real sync later discovers the server's mailbox for a role (even under
// a prefixed namespace like 'INBOX.Sent'), upsertFolder adopts this placeholder
// row rather than creating a duplicate.
export function ensureStandardFolders(db: DB, accountId: number): void {
  for (const s of STANDARD) {
    if (!findFolderByRole(db, accountId, s.role)) upsertFolder(db, accountId, s.name, s.role, s.remote)
  }
}

// Create a custom (roleless) folder, optionally nested under parentId (local only).
// Rejects a blank name or a duplicate within the same parent.
export function createFolder(db: DB, accountId: number, name: string, parentId: number | null = null): number {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name.')
  const dupe = db.get(
    'SELECT id FROM folders WHERE account_id = ? AND IFNULL(parent_id,-1) = IFNULL(?,-1) AND LOWER(name) = LOWER(?)',
    [accountId, parentId, trimmed]
  ) as { id: number } | undefined
  if (dupe) throw new Error(`There's already a folder called “${trimmed}” here.`)
  db.run(
    'INSERT INTO folders (account_id, name, role, remote_path, parent_id) VALUES (?, ?, NULL, ?, ?)',
    [accountId, trimmed, trimmed, parentId]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

// Reparent a custom folder locally (null = top level). Guards self-parent and
// cycles, and refuses to touch the protected standard mailboxes.
export function moveFolder(db: DB, id: number, parentId: number | null): void {
  const f = getFolder(db, id)
  if (!f) throw new Error('That folder no longer exists.')
  if (f.role) throw new Error('The standard folders can’t be moved.')
  if (parentId != null) {
    if (parentId === id) throw new Error('A folder can’t be its own parent.')
    const target = getFolder(db, parentId)
    if (!target) throw new Error('That destination folder no longer exists.')
    // Only the Inbox may act as a parent among the standard mailboxes.
    if (target.role && target.role !== 'inbox') throw new Error('Only the Inbox can hold subfolders among the standard mailboxes.')
    let cur: number | null = parentId
    while (cur != null) {
      if (cur === id) throw new Error('You can’t move a folder into one of its own subfolders.')
      cur = (db.get('SELECT parent_id FROM folders WHERE id = ?', [cur]) as { parent_id: number | null } | undefined)?.parent_id ?? null
    }
  }
  db.run('UPDATE folders SET parent_id = ? WHERE id = ?', [parentId, id])
}

// Persist sibling order as the given id sequence (sort_order = index).
export function reorderFolders(db: DB, ids: number[]): void {
  ids.forEach((id, i) => db.run('UPDATE folders SET sort_order = ? WHERE id = ?', [i, id]))
}

export function renameFolder(db: DB, id: number, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name.')
  const f = getFolder(db, id)
  if (!f) throw new Error('That folder no longer exists.')
  if (f.role) throw new Error('The standard folders can’t be renamed.')
  db.run('UPDATE folders SET name = ?, remote_path = ? WHERE id = ?', [trimmed, trimmed, id])
}

// Delete a custom folder, moving any messages it holds back to the inbox so
// nothing is lost. Returns how many were moved. Standard folders are protected.
export function deleteFolder(db: DB, id: number): number {
  const f = getFolder(db, id)
  if (!f) return 0
  if (f.role) throw new Error('The standard folders can’t be deleted.')
  const inbox = findFolderByRole(db, f.account_id, 'inbox')
  const moved = (db.get('SELECT COUNT(*) c FROM messages WHERE folder_id = ?', [id]) as { c: number }).c
  if (inbox) db.run('UPDATE messages SET folder_id = ? WHERE folder_id = ?', [inbox.id, id])
  db.run('DELETE FROM folders WHERE id = ?', [id])
  if (inbox) refreshFolderCounts(db, inbox.id)
  return moved
}

export function refreshFolderCounts(db: DB, folderId: number): void {
  db.run(
    `UPDATE folders SET
       total_count  = (SELECT COUNT(*) FROM messages WHERE folder_id = ?),
       unread_count = (SELECT COUNT(*) FROM messages WHERE folder_id = ? AND is_read = 0)
     WHERE id = ?`,
    [folderId, folderId, folderId]
  )
}

export function listFolders(db: DB, accountId?: number): FolderSummary[] {
  const rows = (
    accountId
      ? db.all('SELECT * FROM folders WHERE account_id = ? ORDER BY sort_order, id', [accountId])
      : db.all('SELECT * FROM folders ORDER BY account_id, sort_order, id')
  ) as unknown as {
    id: number
    account_id: number
    name: string
    role: string | null
    unread_count: number
    total_count: number
    parent_id: number | null
    sort_order: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    role: r.role,
    unreadCount: r.unread_count,
    totalCount: r.total_count,
    parentId: r.parent_id,
    sortOrder: r.sort_order
  }))
}
