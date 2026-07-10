import type { TaskItem } from '@shared/db'
import type { DB } from './database'

// A deliberately small task list: title + optional due date + done. Today is
// the only surface — no recurrence, subtasks or priorities.

interface TaskRow {
  id: number
  title: string
  due_at: string | null
  done: number
  done_at: string | null
  message_id: number | null
  created_at: string
}

function toItem(r: TaskRow): TaskItem {
  return { id: r.id, title: r.title, dueAt: r.due_at, done: !!r.done, messageId: r.message_id, createdAt: r.created_at }
}

export function createTask(db: DB, title: string, dueAt: string | null = null, messageId: number | null = null): number {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('A task needs a title.')
  db.run('INSERT INTO tasks (title, due_at, message_id) VALUES (?, ?, ?)', [trimmed, dueAt, messageId])
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function setTaskDone(db: DB, id: number, done: boolean): void {
  db.run("UPDATE tasks SET done = ?, done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?", [done ? 1 : 0, done ? 1 : 0, id])
}

export function deleteTask(db: DB, id: number): void {
  db.run('DELETE FROM tasks WHERE id = ?', [id])
}

// Open tasks (due-date order, undated last), plus anything ticked within the
// last day so a finished task lingers briefly before it auto-hides.
export function listTasks(db: DB): TaskItem[] {
  const rows = db.all(
    `SELECT * FROM tasks
      WHERE done = 0 OR done_at > datetime('now', '-1 day')
      ORDER BY done, COALESCE(due_at, '9999-12-31'), id`
  ) as unknown as TaskRow[]
  return rows.map(toItem)
}
