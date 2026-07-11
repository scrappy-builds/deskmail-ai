import { describe, expect, it } from 'vitest'
import { splitMbox } from '../../src/main/mail/mbox'
import { buildVcf, parseVcf } from '../../src/main/contacts/vcard'
import type { ContactDetail } from '../../src/shared/db'

describe('splitMbox', () => {
  it('splits an mbox into individual messages, dropping the From_ separators', () => {
    const mbox = [
      'From alice@ex.com Mon Jul 10 09:00:00 2026',
      'Subject: One',
      '',
      'first body',
      'From bob@ex.com Mon Jul 10 10:00:00 2026',
      'Subject: Two',
      '',
      'second body'
    ].join('\n')
    const msgs = splitMbox(mbox)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toContain('Subject: One')
    expect(msgs[0]).not.toContain('From alice@')
    expect(msgs[1]).toContain('Subject: Two')
  })
})

describe('vCard round-trip', () => {
  const contacts: ContactDetail[] = [
    { id: 1, name: 'Jane Doe', email: 'jane@ex.com', org: 'Acme', notes: 'a note', groups: ['Clients', 'VIP'] }
  ]
  it('builds and re-parses a vCard preserving fields', () => {
    const vcf = buildVcf(contacts)
    expect(vcf).toContain('BEGIN:VCARD')
    expect(vcf).toContain('FN:Jane Doe')
    const parsed = parseVcf(vcf)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Jane Doe')
    expect(parsed[0].email).toBe('jane@ex.com')
    expect(parsed[0].org).toBe('Acme')
    expect(parsed[0].groups).toEqual(['Clients', 'VIP'])
  })
  it('tolerates EMAIL type parameters', () => {
    const parsed = parseVcf('BEGIN:VCARD\r\nFN:Bob\r\nEMAIL;TYPE=WORK:bob@ex.com\r\nEND:VCARD')
    expect(parsed[0].email).toBe('bob@ex.com')
  })
})
