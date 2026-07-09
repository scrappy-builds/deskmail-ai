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
  db.run(
    'INSERT INTO folders (account_id, name, role, remote_path) VALUES (?, ?, ?, ?)',
    [accountId, name, role, remotePath]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
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
      ? db.all('SELECT * FROM folders WHERE account_id = ? ORDER BY id', [accountId])
      : db.all('SELECT * FROM folders ORDER BY account_id, id')
  ) as unknown as {
    id: number
    account_id: number
    name: string
    role: string | null
    unread_count: number
    total_count: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    role: r.role,
    unreadCount: r.unread_count,
    totalCount: r.total_count
  }))
}
