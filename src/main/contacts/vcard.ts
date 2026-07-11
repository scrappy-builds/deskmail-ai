import type { ContactDetail, ContactInput } from '@shared/db'

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}
function unesc(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// Serialise contacts to a vCard 3.0 (.vcf) blob.
export function buildVcf(contacts: ContactDetail[]): string {
  return contacts
    .map((c) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${esc(c.name ?? c.email ?? '')}`,
        c.email ? `EMAIL:${esc(c.email)}` : null,
        c.org ? `ORG:${esc(c.org)}` : null,
        c.groups.length ? `CATEGORIES:${esc(c.groups.join(','))}` : null,
        c.notes ? `NOTE:${esc(c.notes)}` : null,
        'END:VCARD'
      ]
        .filter(Boolean)
        .join('\r\n')
    )
    .join('\r\n')
}

// Parse a .vcf blob into contact inputs (tolerant of param suffixes like EMAIL;TYPE=WORK).
export function parseVcf(raw: string): ContactInput[] {
  const cards = raw.split(/END:VCARD/i).filter((c) => /BEGIN:VCARD/i.test(c))
  return cards
    .map((card): ContactInput => {
      const get = (key: string): string | null => {
        const m = card.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:(.*)$`, 'im'))
        return m ? unesc(m[1].trim()) : null
      }
      const cats = get('CATEGORIES')
      return {
        name: get('FN'),
        email: get('EMAIL'),
        org: get('ORG'),
        notes: get('NOTE'),
        groups: cats ? cats.split(',').map((s) => s.trim()).filter(Boolean) : []
      }
    })
    .filter((c) => c.name || c.email)
}
