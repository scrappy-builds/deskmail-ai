import type { FolderSummary } from '@shared/db'

// Display order for the familiar mailboxes; custom folders (role null) sort after.
// Drafts is a separate local view, so it's left out of folder listings here.
const ROLE_ORDER: Record<string, number> = { inbox: 0, sent: 2, junk: 3, trash: 4, archive: 5 }

export interface FolderNode {
  folder: FolderSummary
  depth: number
}

// Flatten the folders into the same display order the sidebar uses:
//   Inbox, [Inbox's custom subfolders], Sent, Junk, Trash, Archive,
//   then top-level custom folders (each with its own subtree).
// Standard roles are de-duplicated — a server can leave a pre-sync placeholder
// plus the real synced mailbox (e.g. two "Sent" rows); we keep the one with the
// most messages, matching the sidebar. Drafts is excluded.
export function flattenFolderTree(folders: FolderSummary[]): FolderNode[] {
  const byRole = new Map<string, FolderSummary>()
  const custom: FolderSummary[] = []
  for (const f of folders) {
    if (f.role === 'drafts') continue
    if (f.role && f.role in ROLE_ORDER) {
      const prev = byRole.get(f.role)
      if (!prev || f.totalCount > prev.totalCount) byRole.set(f.role, f)
    } else if (!f.role) {
      custom.push(f)
    }
  }
  const standard = [...byRole.values()].sort((a, b) => ROLE_ORDER[a.role!] - ROLE_ORDER[b.role!])

  const childrenOf = (pid: number | null): FolderSummary[] =>
    custom.filter((f) => (f.parentId ?? null) === pid).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const out: FolderNode[] = []
  const pushSubtree = (parentId: number, depth: number): void => {
    for (const child of childrenOf(parentId)) {
      out.push({ folder: child, depth })
      pushSubtree(child.id, depth + 1)
    }
  }

  for (const s of standard) {
    out.push({ folder: s, depth: 0 })
    pushSubtree(s.id, 1) // custom subfolders nest beneath their standard parent (the Inbox)
  }
  for (const top of childrenOf(null)) {
    out.push({ folder: top, depth: 0 })
    pushSubtree(top.id, 1)
  }
  return out
}
