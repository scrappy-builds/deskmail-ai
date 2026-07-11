import type { Template } from '@shared/db'
import type { DB } from './database'

interface Row {
  id: number
  name: string
  subject: string | null
  body: string | null
}

export function listTemplates(db: DB): Template[] {
  return db.all('SELECT id, name, subject, body FROM templates ORDER BY name') as unknown as Row[]
}

export function createTemplate(db: DB, name: string, subject: string, body: string): number {
  db.run('INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)', [name, subject, body])
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

export function updateTemplate(db: DB, id: number, name: string, subject: string, body: string): void {
  db.run("UPDATE templates SET name = ?, subject = ?, body = ?, updated_at = datetime('now') WHERE id = ?", [name, subject, body, id])
}

export function deleteTemplate(db: DB, id: number): void {
  db.run('DELETE FROM templates WHERE id = ?', [id])
}

// Seed a few generic, useful canned replies. Edit or delete these in Settings →
// Templates; the [Your name] placeholder is meant to be replaced.
export function seedTemplatesIfEmpty(db: DB): void {
  const count = (db.get('SELECT COUNT(*) c FROM templates') as { c: number }).c
  if (count > 0) return
  const seeds: [string, string, string][] = [
    [
      'Acknowledge receipt',
      'Re: your email',
      "Thanks for your email — I've received it and will get back to you properly shortly.\n\nBest,\n[Your name]"
    ],
    [
      'Ask for more details',
      'Re: your enquiry',
      "Thanks for getting in touch. To help with this, could you send over a few more details? Once I have those I'll come back to you.\n\nBest,\n[Your name]"
    ],
    [
      'Following up',
      'Following up',
      "Just following up on my message below — let me know if you've had a chance to take a look. No rush.\n\nBest,\n[Your name]"
    ]
  ]
  for (const [name, subject, body] of seeds) createTemplate(db, name, subject, body)
}
