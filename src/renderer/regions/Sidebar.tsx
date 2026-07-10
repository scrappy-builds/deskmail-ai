import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import type { FolderSummary } from '@shared/db'
import { useMail } from '../store/mailStore'
import { useToast } from '../store/toastStore'

// Display order for the familiar mailboxes; custom folders (role null) sort after.
const ROLE_ORDER: Record<string, number> = { inbox: 0, sent: 2, junk: 3, trash: 4, archive: 5 }

// Collapsed folder ids persist locally so the tree stays how you left it.
function loadCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem('deskmail.collapsedFolders')
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch {
    /* ignore */
  }
  return new Set()
}
function saveCollapsed(s: Set<number>): void {
  try { localStorage.setItem('deskmail.collapsedFolders', JSON.stringify([...s])) } catch { /* ignore */ }
}

// Map a folder role/name to an icon.
function folderIcon(role: string | null, name: string): IconName {
  const r = (role ?? name).toLowerCase()
  if (r.includes('sent')) return 'send'
  if (r.includes('draft')) return 'draft'
  if (r.includes('trash') || r.includes('bin')) return 'trash'
  if (r.includes('junk') || r.includes('spam')) return 'shield'
  if (r.includes('archive')) return 'archive'
  if (r.includes('star') || r.includes('flag')) return 'star'
  if (r.includes('inbox')) return 'inbox'
  return 'draft' // generic custom folder
}

// Standard folders can appear twice (a pre-sync placeholder + the real synced
// mailbox). Keep one per role — the one with the most messages — plus every
// custom folder. Drafts is handled by the dedicated local Drafts view below.
function orderedFolders(folders: FolderSummary[]): FolderSummary[] {
  const byRole = new Map<string, FolderSummary>()
  const custom: FolderSummary[] = []
  for (const f of folders) {
    if (f.role === 'drafts') continue
    if (f.role && f.role in ROLE_ORDER) {
      const prev = byRole.get(f.role)
      if (!prev || f.totalCount > prev.totalCount) byRole.set(f.role, f)
    } else {
      custom.push(f)
    }
  }
  const standard = [...byRole.values()].sort((a, b) => ROLE_ORDER[a.role!] - ROLE_ORDER[b.role!])
  custom.sort((a, b) => a.name.localeCompare(b.name))
  return [...standard, ...custom]
}

function Overline({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-2 pb-2 pt-1 text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">{children}</div>
}

type DropPos = 'before' | 'after' | 'inside'

// Row for one custom folder: click to open, right-click for a context menu,
// drag to reorder (drop above/below a sibling) or nest (drop onto a folder).
function CustomFolderRow({
  f,
  active,
  showLabels,
  depth,
  dropIndicator,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onNewSubfolder
}: {
  f: FolderSummary
  active: boolean
  showLabels: boolean
  depth: number
  dropIndicator: DropPos | null
  hasChildren: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onDragStart: () => void
  onDragOver: (pos: DropPos) => void
  onDrop: () => void
  onDragEnd: () => void
  onNewSubfolder: () => void
}): JSX.Element {
  const setFolder = useMail((s) => s.setFolder)
  const showToast = useToast((s) => s.show)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(f.name)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const rename = async (): Promise<void> => {
    const trimmed = name.trim()
    setEditing(false)
    if (!trimmed || trimmed === f.name) return
    try {
      await window.deskmail.mail.renameFolder(f.id, trimmed)
    } catch (e) {
      showToast({ text: (e as Error).message })
      setName(f.name)
    }
  }

  const remove = async (): Promise<void> => {
    setMenu(null)
    try {
      const { moved } = await window.deskmail.mail.deleteFolder(f.id)
      showToast({ text: moved > 0 ? `Deleted “${f.name}” — ${moved} message(s) moved to Inbox` : `Deleted “${f.name}”` })
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  const indent = showLabels ? depth * 16 : 0

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void rename()
          if (e.key === 'Escape') {
            setName(f.name)
            setEditing(false)
          }
        }}
        style={{ marginLeft: indent }}
        className="mb-px w-full rounded-md border border-accent bg-bg px-[9px] py-1.5 text-[13.5px] outline-none"
      />
    )
  }

  return (
    <div
      ref={ref}
      className="group relative"
      draggable={showLabels}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        const y = e.clientY - r.top
        onDragOver(y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside')
      }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      style={{
        marginLeft: indent,
        borderTop: dropIndicator === 'before' ? '2px solid var(--accent)' : '2px solid transparent',
        borderBottom: dropIndicator === 'after' ? '2px solid var(--accent)' : '2px solid transparent'
      }}
    >
      <button
        onClick={() => void setFolder(f.id)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
        title={f.name}
        className="flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
        style={{
          justifyContent: showLabels ? 'flex-start' : 'center',
          background: dropIndicator === 'inside' ? 'var(--accent-soft)' : active ? 'var(--accent-soft)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-2)',
          outline: dropIndicator === 'inside' ? '1.5px dashed var(--accent)' : 'none'
        }}
      >
        {showLabels && hasChildren && (
          <span onClick={(e) => { e.stopPropagation(); onToggleCollapse() }} title={collapsed ? 'Expand' : 'Collapse'} className="-ml-1.5 flex-none cursor-pointer rounded p-0.5 text-text-3 hover:text-text">
            <Icon name="chevronDown" size={12} className={collapsed ? '-rotate-90' : ''} />
          </span>
        )}
        <Icon name={folderIcon(f.role, f.name)} size={18} className="flex-none" />
        {showLabels && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>
              {f.name}
            </span>
            <span className="flex flex-none items-center gap-1.5 text-[11.5px]">
              {f.unreadCount > 0 && <span className="font-semibold text-accent">{f.unreadCount}</span>}
              {f.totalCount > 0 && <span className="text-text-3">{f.totalCount}</span>}
            </span>
          </div>
        )}
      </button>
      {showLabels && (
        <button
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
          title="Folder options"
          className="absolute right-1 top-1.5 hidden rounded p-1 text-text-3 hover:bg-raised group-hover:block"
        >
          <Icon name="sliders" size={14} />
        </button>
      )}
      {menu && (
        <div className="absolute right-1 top-8 z-20 w-[160px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
          <button onClick={() => { setMenu(null); void window.deskmail.mail.markFolderRead(f.id).then(({ count }) => showToast({ text: count > 0 ? `Marked ${count} as read` : 'Nothing unread here' })) }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
            Mark all read
          </button>
          <button onClick={() => { setMenu(null); onNewSubfolder() }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
            New subfolder
          </button>
          <button onClick={() => { setMenu(null); setEditing(true) }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
            Rename
          </button>
          <button onClick={() => void remove()} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-danger hover:bg-raised">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// Renders custom (roleless) folders as a nested tree with drag-to-reorder/nest.
// rootParentId chooses which parent's children to render (null = top level; a
// standard-folder id renders that folder's local subfolders, e.g. the Inbox).
function FolderTree({ folders, activeFolderId, showLabels, collapsed, onToggleCollapse, rootParentId = null, baseDepth = 0 }: { folders: FolderSummary[]; activeFolderId: number | null; showLabels: boolean; collapsed: Set<number>; onToggleCollapse: (id: number) => void; rootParentId?: number | null; baseDepth?: number }): JSX.Element {
  const showToast = useToast((s) => s.show)
  const dragId = useRef<number | null>(null)
  const [drop, setDrop] = useState<{ id: number; pos: DropPos } | null>(null)
  const [addingChildOf, setAddingChildOf] = useState<number | null>(null)
  const [childName, setChildName] = useState('')

  const childrenOf = (pid: number | null): FolderSummary[] =>
    folders
      .filter((f) => (f.parentId ?? null) === pid)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const commitDrop = async (target: FolderSummary): Promise<void> => {
    const id = dragId.current
    dragId.current = null
    const pos = drop?.pos ?? 'inside'
    setDrop(null)
    if (id == null || id === target.id) return
    try {
      if (pos === 'inside') {
        await window.deskmail.mail.moveFolder(id, target.id)
      } else {
        await window.deskmail.mail.moveFolder(id, target.parentId ?? null)
        const siblings = childrenOf(target.parentId ?? null).map((f) => f.id).filter((sid) => sid !== id)
        const idx = siblings.indexOf(target.id)
        siblings.splice(pos === 'before' ? idx : idx + 1, 0, id)
        await window.deskmail.mail.reorderFolders(siblings)
      }
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  const addChild = async (parentId: number): Promise<void> => {
    const trimmed = childName.trim()
    setAddingChildOf(null)
    setChildName('')
    if (!trimmed) return
    const accountId = folders.find((f) => f.id === parentId)?.accountId
    if (accountId == null) return
    try {
      await window.deskmail.mail.createFolder(accountId, trimmed, parentId)
      showToast({ text: `Created “${trimmed}”` })
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  const render = (pid: number | null, depth: number): JSX.Element[] =>
    childrenOf(pid).flatMap((f) => {
      const kids = childrenOf(f.id)
      const isCollapsed = collapsed.has(f.id)
      const rows: JSX.Element[] = [
        <CustomFolderRow
          key={f.id}
          f={f}
          active={f.id === activeFolderId}
          showLabels={showLabels}
          depth={depth}
          dropIndicator={drop?.id === f.id ? drop.pos : null}
          hasChildren={kids.length > 0}
          collapsed={isCollapsed}
          onToggleCollapse={() => onToggleCollapse(f.id)}
          onDragStart={() => { dragId.current = f.id }}
          onDragOver={(pos) => setDrop({ id: f.id, pos })}
          onDrop={() => void commitDrop(f)}
          onDragEnd={() => { dragId.current = null; setDrop(null) }}
          onNewSubfolder={() => { setAddingChildOf(f.id); setChildName('') }}
        />
      ]
      if (addingChildOf === f.id && showLabels) {
        rows.push(
          <input
            key={`add-${f.id}`}
            autoFocus
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onBlur={() => void addChild(f.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addChild(f.id)
              if (e.key === 'Escape') { setAddingChildOf(null); setChildName('') }
            }}
            placeholder="Subfolder name…"
            style={{ marginLeft: (depth + 1) * 16 }}
            className="mb-px w-full rounded-md border border-accent bg-bg px-[9px] py-1.5 text-[13.5px] outline-none"
          />
        )
      }
      if (!isCollapsed) rows.push(...render(f.id, depth + 1))
      return rows
    })

  return <>{render(rootParentId, baseDepth)}</>
}

export function Sidebar({
  showLabels,
  onOpenDrafts,
  onOpenOutbox,
  onOpenSmartBuilder
}: {
  showLabels: boolean
  onOpenDrafts?: () => void
  onOpenOutbox?: () => void
  onOpenSmartBuilder?: () => void
}): JSX.Element {
  const { accounts, folders, labels, smartViews, activeFolderId, activeLabelId, activeSmartViewId, setFolder, setLabel, setSmartView } = useMail()
  const showToast = useToast((s) => s.show)
  const [draftCount, setDraftCount] = useState(0)
  const [outboxCount, setOutboxCount] = useState(0)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingLabel, setAddingLabel] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  // Standard-folder right-click menu (which folder's menu is open) + the Inbox's
  // inline "new subfolder" state (only the Inbox can hold subfolders).
  const [menuFolderId, setMenuFolderId] = useState<number | null>(null)
  const [addingInboxChild, setAddingInboxChild] = useState(false)
  const [inboxChildName, setInboxChildName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed)
  const toggleCollapse = (id: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveCollapsed(next)
      return next
    })
  }

  useEffect(() => {
    const refresh = (): void => {
      void window.deskmail.compose.listDrafts().then((d) => setDraftCount(d.length))
      void window.deskmail.compose.listScheduled().then((s) => setOutboxCount(s.length))
    }
    refresh()
    return window.deskmail.mail.onChanged(refresh)
  }, [])

  // Close the standard-folder menu on an outside click.
  useEffect(() => {
    if (menuFolderId == null) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFolderId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuFolderId])

  // Mark every message in a folder read; empty (permanently) a Junk/Trash folder.
  const markAllRead = async (folderId: number): Promise<void> => {
    setMenuFolderId(null)
    const { count } = await window.deskmail.mail.markFolderRead(folderId)
    showToast({ text: count > 0 ? `Marked ${count} as read` : 'Nothing unread here' })
  }
  const emptyFolderNow = async (f: FolderSummary): Promise<void> => {
    setMenuFolderId(null)
    // ponytail: window.confirm is the lazy-correct guard for a destructive, unrecoverable action.
    if (!window.confirm(`Permanently delete everything in ${f.name}? This can't be undone.`)) return
    const { count } = await window.deskmail.mail.emptyFolder(f.id)
    showToast({ text: count > 0 ? `Permanently deleted ${count} message${count > 1 ? 's' : ''}` : `${f.name} is already empty` })
  }

  if (accounts.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {showLabels && (
          <p className="text-[12.5px] leading-relaxed text-text-3">
            No mailbox yet. Add one in <span className="font-semibold text-text-2">File → Settings → Accounts</span> to
            start syncing.
          </p>
        )}
      </div>
    )
  }

  // Which account a new folder belongs to: the active folder's, else the first.
  const targetAccountId = folders.find((f) => f.id === activeFolderId)?.accountId ?? accounts[0]?.id

  const addFolder = async (): Promise<void> => {
    const trimmed = newName.trim()
    setAdding(false)
    setNewName('')
    if (!trimmed || targetAccountId == null) return
    try {
      await window.deskmail.mail.createFolder(targetAccountId, trimmed)
      showToast({ text: `Created folder “${trimmed}”` })
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  const createInboxChild = async (inbox: FolderSummary, rawName: string): Promise<void> => {
    const trimmed = rawName.trim()
    setAddingInboxChild(false)
    setInboxChildName('')
    if (!trimmed) return
    try {
      await window.deskmail.mail.createFolder(inbox.accountId, trimmed, inbox.id)
      showToast({ text: `Created “${trimmed}” in Inbox` })
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }

  const addLabelNow = async (): Promise<void> => {
    const trimmed = newLabel.trim()
    setAddingLabel(false)
    setNewLabel('')
    if (!trimmed) return
    try {
      await window.deskmail.labels.create(trimmed)
      showToast({ text: `Created label “${trimmed}”` })
    } catch (e) {
      showToast({ text: (e as Error).message })
    }
  }
  const removeLabel = async (id: number, name: string): Promise<void> => {
    await window.deskmail.labels.remove(id)
    showToast({ text: `Deleted label “${name}”` })
  }

  const ordered = orderedFolders(folders)

  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-3">
      {showLabels && <Overline>Accounts</Overline>}
      {accounts.map((a) => (
        <div key={a.id} className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-[7px]" title={a.emailAddress}>
          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: a.colour ?? 'var(--accent)' }} />
          {showLabels && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{a.displayName}</div>
              <div className="truncate text-[11px] text-text-3">{a.emailAddress}</div>
            </div>
          )}
        </div>
      ))}

      <div className="h-3.5" />
      {showLabels && (
        <div className="flex items-center pr-1">
          <Overline>Folders</Overline>
          <div className="flex-1" />
          <button onClick={() => setAdding(true)} title="New folder" className="mb-1 rounded p-1 text-text-3 hover:bg-raised hover:text-text-2">
            <Icon name="plus" size={15} />
          </button>
        </div>
      )}

      {/* Standard mailboxes: fixed order, flat, not draggable. The Inbox is
          special — it can hold custom subfolders (nested beneath it) and has a
          right-click / options menu to add one. */}
      {ordered
        .filter((f) => f.role)
        .map((f) => {
          const active = f.id === activeFolderId
          const isInbox = f.role === 'inbox'
          const canEmpty = f.role === 'junk' || f.role === 'trash'
          const inboxHasKids = isInbox && folders.some((x) => !x.role && (x.parentId ?? null) === f.id)
          return (
            <div key={f.id} className="group relative">
              <button
                onClick={() => void setFolder(f.id)}
                onContextMenu={showLabels ? (e) => { e.preventDefault(); setMenuFolderId(f.id) } : undefined}
                title={f.name}
                className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
                style={{
                  justifyContent: showLabels ? 'flex-start' : 'center',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-2)'
                }}
              >
                {showLabels && isInbox && inboxHasKids && (
                  <span onClick={(e) => { e.stopPropagation(); toggleCollapse(f.id) }} title={collapsed.has(f.id) ? 'Expand' : 'Collapse'} className="-ml-1.5 flex-none cursor-pointer rounded p-0.5 text-text-3 hover:text-text">
                    <Icon name="chevronDown" size={12} className={collapsed.has(f.id) ? '-rotate-90' : ''} />
                  </span>
                )}
                <Icon name={folderIcon(f.role, f.name)} size={18} className="flex-none" />
                {showLabels && (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>
                      {f.name}
                    </span>
                    <span className="flex flex-none items-center gap-1.5 text-[11.5px]">
                      {f.unreadCount > 0 && <span className="font-semibold text-accent">{f.unreadCount}</span>}
                      {f.totalCount > 0 && <span className="text-text-3">{f.totalCount}</span>}
                    </span>
                  </div>
                )}
              </button>
              {showLabels && (
                <button
                  onClick={() => setMenuFolderId(f.id)}
                  title="Folder options"
                  className="absolute right-1 top-1.5 hidden rounded p-1 text-text-3 hover:bg-raised group-hover:block"
                >
                  <Icon name="sliders" size={14} />
                </button>
              )}
              {menuFolderId === f.id && (
                <div ref={menuRef} className="absolute right-1 top-8 z-20 w-[180px] rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
                  <button onClick={() => void markAllRead(f.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                    Mark all read
                  </button>
                  {isInbox && (
                    <button onClick={() => { setMenuFolderId(null); setAddingInboxChild(true); setInboxChildName('') }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent">
                      New subfolder
                    </button>
                  )}
                  {canEmpty && (
                    <button onClick={() => void emptyFolderNow(f)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-danger hover:bg-raised">
                      {f.role === 'trash' ? 'Empty deleted items' : 'Empty Junk'}
                    </button>
                  )}
                </div>
              )}
              {isInbox && addingInboxChild && showLabels && (
                <input
                  autoFocus
                  value={inboxChildName}
                  onChange={(e) => setInboxChildName(e.target.value)}
                  onBlur={() => void createInboxChild(f, inboxChildName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createInboxChild(f, inboxChildName)
                    if (e.key === 'Escape') { setAddingInboxChild(false); setInboxChildName('') }
                  }}
                  placeholder="Subfolder name…"
                  style={{ marginLeft: 16 }}
                  className="mb-px w-full rounded-md border border-accent bg-bg px-[9px] py-1.5 text-[13.5px] outline-none"
                />
              )}
              {isInbox && showLabels && !collapsed.has(f.id) && (
                <FolderTree folders={folders.filter((x) => !x.role)} activeFolderId={activeFolderId} showLabels={showLabels} collapsed={collapsed} onToggleCollapse={toggleCollapse} rootParentId={f.id} baseDepth={1} />
              )}
            </div>
          )
        })}

      {/* Custom folders: nested tree with drag-to-reorder/nest + right-click menu. */}
      <FolderTree folders={folders.filter((f) => !f.role)} activeFolderId={activeFolderId} showLabels={showLabels} collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      {showLabels && adding && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={addFolder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addFolder()
            if (e.key === 'Escape') {
              setNewName('')
              setAdding(false)
            }
          }}
          placeholder="Folder name…"
          className="mb-px w-full rounded-md border border-accent bg-bg px-[9px] py-1.5 text-[13.5px] outline-none"
        />
      )}

      {/* Labels / tags — click to filter the list to a label; distinct from folders. */}
      {showLabels && <div className="h-3" />}
      {showLabels && (
        <div className="flex items-center pr-1">
          <Overline>Labels</Overline>
          <div className="flex-1" />
          <button onClick={() => setAddingLabel(true)} title="New label" className="mb-1 rounded p-1 text-text-3 hover:bg-raised hover:text-text-2">
            <Icon name="plus" size={15} />
          </button>
        </div>
      )}
      {showLabels &&
        labels.map((l) => {
          const active = l.id === activeLabelId
          return (
            <div key={l.id} className="group relative">
              <button
                onClick={() => void setLabel(l.id)}
                title={l.name}
                className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
                style={{ background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-2)' }}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: l.colour ?? 'var(--accent)' }} />
                <span className="min-w-0 flex-1 truncate text-left text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>
                  {l.name}
                </span>
              </button>
              <button
                onClick={() => void removeLabel(l.id, l.name)}
                title="Delete label"
                className="absolute right-1 top-1.5 hidden rounded p-1 text-text-3 hover:bg-raised hover:text-danger group-hover:block"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          )
        })}
      {showLabels && addingLabel && (
        <input
          autoFocus
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onBlur={addLabelNow}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addLabelNow()
            if (e.key === 'Escape') {
              setNewLabel('')
              setAddingLabel(false)
            }
          }}
          placeholder="Label name…"
          className="mb-px w-full rounded-md border border-accent bg-bg px-[9px] py-1.5 text-[13.5px] outline-none"
        />
      )}

      {/* Smart views — saved condition sets, run on demand across the mailbox. */}
      {showLabels && <div className="h-3" />}
      {showLabels && (
        <div className="flex items-center pr-1">
          <Overline>Smart views</Overline>
          <div className="flex-1" />
          <button onClick={onOpenSmartBuilder} title="New smart view" className="mb-1 rounded p-1 text-text-3 hover:bg-raised hover:text-text-2">
            <Icon name="plus" size={15} />
          </button>
        </div>
      )}
      {showLabels &&
        smartViews.map((v) => {
          const active = v.id === activeSmartViewId
          return (
            <div key={v.id} className="group relative">
              <button
                onClick={() => void setSmartView(v.id)}
                title={v.name}
                className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
                style={{ background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-2)' }}
              >
                <Icon name="filter" size={18} className="flex-none" />
                <span className="min-w-0 flex-1 truncate text-left text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>{v.name}</span>
              </button>
              <button
                onClick={() => void window.deskmail.smartViews.remove(v.id)}
                title="Delete smart view"
                className="absolute right-1 top-1.5 hidden rounded p-1 text-text-3 hover:bg-raised hover:text-danger group-hover:block"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          )
        })}

      {showLabels && <div className="h-3" />}
      {/* Local drafts (incl. any Claude wrote via the connector) */}
      <button
        onClick={onOpenDrafts}
        title="Drafts"
        className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 text-text-2 hover:bg-hover"
        style={{ justifyContent: showLabels ? 'flex-start' : 'center' }}
      >
        <Icon name="draft" size={18} className="flex-none" />
        {showLabels && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-[13.5px]">Drafts</span>
            {draftCount > 0 && <span className="text-[11.5px] font-semibold text-text-3">{draftCount}</span>}
          </div>
        )}
      </button>

      {/* Outbox: mail queued to send (undo-send window + scheduled sends) */}
      <button
        onClick={onOpenOutbox}
        title="Outbox"
        className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 text-text-2 hover:bg-hover"
        style={{ justifyContent: showLabels ? 'flex-start' : 'center' }}
      >
        <Icon name="send" size={18} className="flex-none" />
        {showLabels && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-[13.5px]">Outbox</span>
            {outboxCount > 0 && <span className="text-[11.5px] font-semibold text-accent">{outboxCount}</span>}
          </div>
        )}
      </button>
    </div>
  )
}
