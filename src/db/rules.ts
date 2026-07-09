import type { Rule, RuleInput } from '@shared/db'
import type { DB } from './database'
import { applyAction } from './mailActions'
import { setMessageLabel } from './labels'

interface RuleRow {
  id: number
  name: string
  enabled: number
  field: string
  op: string
  value: string
  action: string
  target_folder_id: number | null
  target_label_id: number | null
}

function toRule(r: RuleRow): Rule {
  return {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    field: r.field as Rule['field'],
    op: r.op as Rule['op'],
    value: r.value,
    action: r.action as Rule['action'],
    targetFolderId: r.target_folder_id,
    targetLabelId: r.target_label_id
  }
}

export function listRules(db: DB): Rule[] {
  return (db.all('SELECT * FROM rules ORDER BY id') as unknown as RuleRow[]).map(toRule)
}

export function createRule(db: DB, r: RuleInput): number {
  db.run(
    `INSERT INTO rules (name, enabled, field, op, value, action, target_folder_id, target_label_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.name, r.enabled ? 1 : 0, r.field, r.op, r.value, r.action, r.targetFolderId, r.targetLabelId]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function updateRule(db: DB, id: number, r: RuleInput): void {
  db.run(
    `UPDATE rules SET name = ?, enabled = ?, field = ?, op = ?, value = ?, action = ?,
       target_folder_id = ?, target_label_id = ? WHERE id = ?`,
    [r.name, r.enabled ? 1 : 0, r.field, r.op, r.value, r.action, r.targetFolderId, r.targetLabelId, id]
  )
}

export function deleteRule(db: DB, id: number): void {
  db.run('DELETE FROM rules WHERE id = ?', [id])
}

// Pure match test — the useful field vs the rule's value. Case-insensitive.
export function ruleMatches(rule: Rule, msg: { from: string; subject: string; to: string; body: string }): boolean {
  const needle = rule.value.trim().toLowerCase()
  if (!needle) return false
  const hay = (rule.field === 'from' ? msg.from : rule.field === 'subject' ? msg.subject : rule.field === 'to' ? msg.to : msg.body).toLowerCase()
  if (rule.op === 'equals') return hay.trim() === needle
  if (rule.op === 'startswith') return hay.trimStart().startsWith(needle)
  return hay.includes(needle)
}

// Run every enabled rule against a freshly-ingested message, applying the first
// matching action(s). Reuses applyAction so move/junk/archive also queue the IMAP
// change. Called from the sync/ingest path.
export function applyRulesToMessage(db: DB, messageId: number): void {
  const rules = listRules(db).filter((r) => r.enabled)
  if (rules.length === 0) return
  const r = db.get('SELECT subject, from_name, from_email, to_json, body_text FROM messages WHERE id = ?', [messageId]) as
    | { subject: string | null; from_name: string | null; from_email: string | null; to_json: string | null; body_text: string | null }
    | undefined
  if (!r) return
  let to: string[] = []
  try {
    to = r.to_json ? (JSON.parse(r.to_json) as string[]) : []
  } catch {
    to = []
  }
  const msg = {
    from: `${r.from_name ?? ''} ${r.from_email ?? ''}`.trim(),
    subject: r.subject ?? '',
    to: to.join(' '),
    body: r.body_text ?? ''
  }

  for (const rule of rules) {
    if (!ruleMatches(rule, msg)) continue
    switch (rule.action) {
      case 'star':
        applyAction(db, messageId, 'flag')
        break
      case 'read':
        applyAction(db, messageId, 'read')
        break
      case 'junk':
        applyAction(db, messageId, 'junk')
        break
      case 'archive':
        applyAction(db, messageId, 'archive')
        break
      case 'move':
        if (rule.targetFolderId != null) applyAction(db, messageId, 'move', rule.targetFolderId)
        break
      case 'label':
        if (rule.targetLabelId != null) setMessageLabel(db, messageId, rule.targetLabelId, true)
        break
    }
  }
}
