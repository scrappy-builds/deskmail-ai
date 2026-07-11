import { describe, expect, it } from 'vitest'
import type { FolderSummary } from '../../src/shared/db'
import { flattenFolderTree } from '../../src/renderer/mail/folderTree'

function f(id: number, over: Partial<FolderSummary>): FolderSummary {
  return { id, accountId: 1, name: `F${id}`, role: null, unreadCount: 0, totalCount: 0, parentId: null, sortOrder: 0, ...over }
}

describe('flattenFolderTree', () => {
  it('de-duplicates standard roles, keeping the busier copy, and orders them', () => {
    const folders = [
      f(5, { role: 'archive', name: 'Archive' }),
      f(1, { role: 'inbox', name: 'Inbox' }),
      f(3, { role: 'sent', name: 'Sent', totalCount: 0 }),
      f(4, { role: 'sent', name: 'Sent', totalCount: 12 }), // synced copy — should win
      f(6, { role: 'junk', name: 'Junk' }),
      f(7, { role: 'trash', name: 'Trash' }),
      f(9, { role: 'drafts', name: 'Drafts' }) // excluded
    ]
    const names = flattenFolderTree(folders).map((n) => `${n.folder.name}#${n.folder.id}`)
    expect(names).toEqual(['Inbox#1', 'Sent#4', 'Junk#6', 'Trash#7', 'Archive#5'])
  })

  it('nests an Inbox subfolder directly under the Inbox, before Sent', () => {
    const inbox = f(1, { role: 'inbox', name: 'Inbox' })
    const sub = f(10, { name: 'Receipts', parentId: 1 })
    const sent = f(2, { role: 'sent', name: 'Sent' })
    const top = f(11, { name: 'Projects' }) // top-level custom → after standard mailboxes
    const out = flattenFolderTree([sent, inbox, sub, top])
    expect(out.map((n) => n.folder.name)).toEqual(['Inbox', 'Receipts', 'Sent', 'Projects'])
    expect(out.find((n) => n.folder.name === 'Receipts')?.depth).toBe(1)
    expect(out.find((n) => n.folder.name === 'Projects')?.depth).toBe(0)
  })
})
