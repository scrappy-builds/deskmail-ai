import type { MessageListItem, SmartCondition, SmartView, SmartViewInput } from '@shared/db'
import type { DB } from './database'
import { listMessageRowsToItems } from './messages'

interface Row {
  id: number
  name: string
  match: string
  conditions_json: string
}

function parseConditions(json: string): SmartCondition[] {
  try {
    const a = JSON.parse(json)
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

export function listSmartViews(db: DB): SmartView[] {
  const rows = db.all('SELECT id, name, match, conditions_json FROM smart_views ORDER BY name, id') as unknown as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, match: r.match === 'any' ? 'any' : 'all', conditions: parseConditions(r.conditions_json) }))
}

export function createSmartView(db: DB, v: SmartViewInput): number {
  db.run('INSERT INTO smart_views (name, match, conditions_json) VALUES (?, ?, ?)', [v.name.trim() || 'Smart view', v.match, JSON.stringify(v.conditions)])
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function deleteSmartView(db: DB, id: number): void {
  db.run('DELETE FROM smart_views WHERE id = ?', [id])
}

// Turn one condition into a SQL fragment (+ params). Text fields use LIKE with
// the operator; the flag fields (unread/starred/attachment) are booleans.
function conditionSql(c: SmartCondition): { sql: string; params: string[] } | null {
  if (c.field === 'unread') return { sql: 'is_read = 0', params: [] }
  if (c.field === 'starred') return { sql: 'is_starred = 1', params: [] }
  if (c.field === 'attachment') return { sql: 'has_attachments = 1', params: [] }

  const v = c.value.trim().toLowerCase()
  if (!v) return null
  const like = c.op === 'equals' ? v : c.op === 'startswith' ? `${v}%` : `%${v}%`
  const cols =
    c.field === 'from'
      ? ['from_name', 'from_email']
      : c.field === 'to'
        ? ['to_json']
        : c.field === 'subject'
          ? ['subject']
          : ['body_text']
  if (c.op === 'equals' && (c.field === 'subject' || c.field === 'body')) {
    return { sql: `LOWER(${cols[0]}) = ?`, params: [v] }
  }
  return { sql: `(${cols.map((col) => `LOWER(${col}) LIKE ?`).join(' OR ')})`, params: cols.map(() => like) }
}

// Build the WHERE clause for a smart view. Exported for unit testing.
export function buildSmartViewWhere(view: SmartViewInput): { clause: string; params: string[] } {
  const parts: string[] = []
  const params: string[] = []
  for (const c of view.conditions) {
    const frag = conditionSql(c)
    if (!frag) continue
    parts.push(frag.sql)
    params.push(...frag.params)
  }
  if (parts.length === 0) return { clause: 'is_muted = 0', params: [] }
  const joined = parts.join(view.match === 'any' ? ' OR ' : ' AND ')
  return { clause: `(${joined}) AND is_muted = 0`, params }
}

export function runSmartView(db: DB, id: number): MessageListItem[] {
  const view = listSmartViews(db).find((v) => v.id === id)
  if (!view) return []
  const { clause, params } = buildSmartViewWhere(view)
  const rows = db.all(
    `SELECT * FROM messages WHERE ${clause} ORDER BY is_pinned DESC, received_at DESC, id DESC LIMIT 300`,
    params
  )
  return listMessageRowsToItems(rows)
}
