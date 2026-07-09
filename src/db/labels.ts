import type { LabelInfo } from '@shared/db'
import type { DB } from './database'

// Colour tags a message can carry (distinct from folders — a message lives in one
// folder but can have many labels). Backed by the existing labels + message_labels
// tables. A small palette so new labels get a sensible default colour.
const PALETTE = ['#2f6fae', '#1e7a38', '#bf8420', '#8a4fbf', '#b0442f', '#1a8a7a']

export function listLabels(db: DB): LabelInfo[] {
  return db.all('SELECT id, name, colour FROM labels ORDER BY name') as unknown as LabelInfo[]
}

export function createLabel(db: DB, name: string, colour?: string): number {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A label needs a name.')
  const dupe = db.get('SELECT id FROM labels WHERE LOWER(name) = LOWER(?)', [trimmed]) as { id: number } | undefined
  if (dupe) throw new Error(`There's already a label called “${trimmed}”.`)
  const count = (db.get('SELECT COUNT(*) c FROM labels') as { c: number }).c
  db.run('INSERT INTO labels (name, colour) VALUES (?, ?)', [trimmed, colour ?? PALETTE[count % PALETTE.length]])
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function renameLabel(db: DB, id: number, name: string, colour?: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A label needs a name.')
  if (colour) db.run('UPDATE labels SET name = ?, colour = ? WHERE id = ?', [trimmed, colour, id])
  else db.run('UPDATE labels SET name = ? WHERE id = ?', [trimmed, id])
}

export function deleteLabel(db: DB, id: number): void {
  db.run('DELETE FROM labels WHERE id = ?', [id]) // message_labels rows cascade
}

export function labelsForMessage(db: DB, messageId: number): LabelInfo[] {
  return db.all(
    `SELECT l.id, l.name, l.colour FROM labels l
       JOIN message_labels ml ON ml.label_id = l.id
      WHERE ml.message_id = ? ORDER BY l.name`,
    [messageId]
  ) as unknown as LabelInfo[]
}

export function setMessageLabel(db: DB, messageId: number, labelId: number, on: boolean): void {
  if (on) db.run('INSERT OR IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)', [messageId, labelId])
  else db.run('DELETE FROM message_labels WHERE message_id = ? AND label_id = ?', [messageId, labelId])
}
