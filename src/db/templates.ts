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

// Seed a few canned replies in Jamie's voice — first person, British, honest.
export function seedTemplatesIfEmpty(db: DB): void {
  const count = (db.get('SELECT COUNT(*) c FROM templates') as { c: number }).c
  if (count > 0) return
  const seeds: [string, string, string][] = [
    [
      'Commission enquiry reply',
      'Re: your design enquiry',
      "Thanks for getting in touch.\n\nHappy to take a look at this. Could you send over rough dimensions, what the part needs to do, and any photos of the space it fits? I'll come back with whether it's something I can design and a rough idea on timing.\n\nJamie"
    ],
    [
      'Licensing reply',
      'Re: commercial licence',
      "Thanks for asking about a licence.\n\nI license designs for businesses to print and sell — you'd get the print-ready files and permission to sell physical prints, with the design staying mine. Let me know which design you're after and roughly your expected volumes and I'll send terms.\n\nJamie"
    ],
    [
      'Dispatch note',
      'Your order is on its way',
      "Just to let you know your order has gone out today, Royal Mail 2nd Class Tracked. It usually arrives within a few working days.\n\nIf anything's not right when it turns up, tell me and I'll sort it.\n\nJamie"
    ]
  ]
  for (const [name, subject, body] of seeds) createTemplate(db, name, subject, body)
}
