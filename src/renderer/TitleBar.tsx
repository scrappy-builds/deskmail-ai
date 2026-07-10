import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { PRESET_LABELS, type LayoutPreset } from '@shared/layout'
import { useLayout } from './store/layoutStore'
import { useMail } from './store/mailStore'
import { buildReplyDraft, type ReplyKind } from './mail/reply'
import { flattenFolderTree } from './mail/folderTree'
import { SORT_LABELS, type SortField } from './mail/sortMessages'
import logo from './assets/logo.png'

type Item = 'sep' | { header: string } | { label: string; kbd?: string; onClick?: () => void; disabled?: boolean; indent?: boolean }

const SNOOZE_OPTS = [
  { label: 'Later today', opt: 'later' as const },
  { label: 'Tomorrow', opt: 'tomorrow' as const },
  { label: 'This weekend', opt: 'weekend' as const },
  { label: 'Next week', opt: 'nextweek' as const }
]

function useMenus(): { open: string | null; toggle: (id: string) => void; close: () => void; rootRef: React.RefObject<HTMLDivElement> } {
  const [open, setOpen] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return { open, toggle: (id) => setOpen((o) => (o === id ? null : id)), close: () => setOpen(null), rootRef }
}

function Dropdown({ items, onPick }: { items: Item[]; onPick: () => void }): JSX.Element {
  return (
    <div className="absolute left-0 top-full z-50 mt-1 max-h-[80vh] min-w-[230px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="mx-2 my-1.5 h-px bg-border" />
        if ('header' in it) return <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[.6px] text-text-3">{it.header}</div>
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => { it.onClick?.(); onPick() }}
            className="flex w-full items-center gap-3.5 rounded-md py-1.5 pr-2.5 text-left text-[12.5px] text-text-2 enabled:hover:bg-[var(--accent-soft)] enabled:hover:text-accent disabled:opacity-35"
            style={{ paddingLeft: it.indent ? 22 : 10 }}
          >
            <span className="flex-1 truncate">{it.label}</span>
            {it.kbd && <span className="font-mono text-[10.5px] text-text-3">{it.kbd}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function TitleBar({
  onOpenSettings,
  onCompose,
  onOpenViewSettings,
  onMode,
  onOpenAttachments
}: {
  onOpenSettings: () => void
  onCompose: () => void
  onOpenViewSettings: () => void
  onMode: (m: 'mail' | 'calendar') => void
  onOpenAttachments: () => void
}): JSX.Element {
  const { open, toggle, close, rootRef } = useMenus()
  const { prefs, usePreset, setPref, toggleTheme } = useLayout()
  const mail = useMail()
  const w = window.deskmail.window
  const selId = mail.selectedId
  const sel = mail.selected
  const hasSel = selId != null
  const activeFolder = mail.activeFolderId

  const act = (op: Parameters<typeof window.deskmail.mail.action>[1]): void => {
    if (selId == null) return
    void window.deskmail.mail.action(selId, op).then(() => void mail.refresh())
  }
  const reply = async (kind: ReplyKind): Promise<void> => {
    if (!sel) return
    const accounts = await window.deskmail.listAccounts()
    const selfEmail = accounts.find((a) => a.id === sel.accountId)?.emailAddress
    const { id } = await window.deskmail.compose.saveDraft(buildReplyDraft(sel, kind, selfEmail))
    window.deskmail.openCompose(id)
  }
  const zoom = (delta: number | 'reset'): void => setPref('fontScale', delta === 'reset' ? 1 : Math.min(1.4, Math.max(0.8, Math.round((prefs.fontScale + delta) * 10) / 10)))

  const moveTo: Item[] = flattenFolderTree(mail.folders)
    .filter((n) => n.folder.role !== 'drafts' && n.folder.id !== activeFolder)
    .map((n) => ({ label: n.folder.name, indent: true, disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.action(selId, 'move', n.folder.id).then(() => void mail.refresh()) } }))

  const labelItems: Item[] = mail.labels.map((l) => ({ label: l.name, indent: true, disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.labels.toggle(selId, l.id, true).then(() => void mail.refresh()) } }))

  const menus: Record<string, Item[]> = {
    File: [
      { label: 'New email', kbd: 'Ctrl N', onClick: onCompose },
      { label: 'New event', onClick: () => onMode('calendar') },
      'sep',
      { label: 'All attachments…', onClick: onOpenAttachments },
      'sep',
      { label: 'Import mail…', disabled: activeFolder == null, onClick: () => { if (activeFolder != null) void window.deskmail.mail.importMail(activeFolder) } },
      { label: 'Export folder to .mbox…', disabled: activeFolder == null, onClick: () => { if (activeFolder != null) void window.deskmail.mail.exportMbox(activeFolder) } },
      'sep',
      { label: 'Save message as PDF…', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.printPdf(selId) } },
      { label: 'Save message as .eml…', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.saveMessage(selId, 'eml') } },
      { label: 'Save message as .html…', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.saveMessage(selId, 'html') } },
      { label: 'Print…', kbd: 'Ctrl P', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.printPdf(selId) } },
      'sep',
      { label: 'Back up all data…', onClick: () => void window.deskmail.storage.backup() },
      { label: 'Settings…', kbd: 'Ctrl ,', onClick: onOpenSettings },
      'sep',
      { label: 'Exit', kbd: 'Ctrl W', onClick: () => w.close() }
    ],
    Edit: [
      { label: mail.lastUndo ? `Undo ${mail.lastUndo.label.toLowerCase()}` : 'Undo', kbd: 'Ctrl Z', disabled: !mail.lastUndo, onClick: () => { mail.lastUndo?.run(); mail.setUndo(null) } },
      'sep',
      { label: 'Select all', kbd: 'Ctrl A', onClick: () => mail.selectAll(mail.messages.map((m) => m.id)) },
      { label: 'Clear selection', disabled: mail.selectedIds.size === 0, onClick: () => mail.clearSelected() },
      'sep',
      { label: 'Find…', kbd: 'Ctrl F', onClick: () => document.getElementById('deskmail-search')?.focus() },
      'sep',
      { label: 'Mark read', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.markRead(selId, true).then(() => void mail.refresh()) } },
      { label: 'Mark unread', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.markRead(selId, false).then(() => void mail.refresh()) } },
      { label: 'Delete', disabled: !hasSel, onClick: () => act('trash') }
    ],
    View: [
      { label: 'View settings…', onClick: onOpenViewSettings },
      { header: 'Layout' },
      ...(Object.keys(PRESET_LABELS) as LayoutPreset[]).filter((p) => p !== 'custom').map((p): Item => ({ label: PRESET_LABELS[p], indent: true, onClick: () => usePreset(p as Exclude<LayoutPreset, 'custom'>) })),
      { header: 'Reading pane' },
      { label: 'Right', indent: true, onClick: () => { setPref('readingPaneVisible', true); setPref('readingPanePosition', 'right') } },
      { label: 'Bottom', indent: true, onClick: () => { setPref('readingPaneVisible', true); setPref('readingPanePosition', 'bottom') } },
      { label: 'Hidden', indent: true, onClick: () => setPref('readingPaneVisible', false) },
      { header: 'Density' },
      { label: 'Comfortable', indent: true, onClick: () => setPref('messageListDensity', 'comfortable') },
      { label: 'Cozy', indent: true, onClick: () => setPref('messageListDensity', 'cozy') },
      { label: 'Compact', indent: true, onClick: () => setPref('messageListDensity', 'compact') },
      { header: 'Sort by' },
      ...(Object.keys(SORT_LABELS) as SortField[]).map((f): Item => ({ label: SORT_LABELS[f], indent: true, onClick: () => mail.setSort({ field: f, dir: mail.sort.dir }) })),
      { label: mail.sort.dir === 'asc' ? 'Ascending ✓' : 'Descending ✓', indent: true, onClick: () => mail.setSort({ field: mail.sort.field, dir: mail.sort.dir === 'asc' ? 'desc' : 'asc' }) },
      'sep',
      { label: mail.threading ? 'Conversations: on ✓' : 'Group into conversations', onClick: () => mail.setThreading(!mail.threading) },
      { label: 'Show / hide folder pane', onClick: () => setPref('sidebarMode', prefs.sidebarMode === 'hidden' ? 'expanded' : 'hidden') },
      { label: 'Zoom in', kbd: 'Ctrl +', onClick: () => zoom(0.1) },
      { label: 'Zoom out', kbd: 'Ctrl -', onClick: () => zoom(-0.1) },
      { label: 'Reset zoom', kbd: 'Ctrl 0', onClick: () => zoom('reset') },
      { label: 'Toggle light / dark', onClick: toggleTheme }
    ],
    Message: [
      { label: 'Reply', kbd: 'Ctrl R', disabled: !hasSel, onClick: () => void reply('reply') },
      { label: 'Reply all', disabled: !hasSel, onClick: () => void reply('replyAll') },
      { label: 'Forward', disabled: !hasSel, onClick: () => void reply('forward') },
      'sep',
      { label: sel?.isStarred ? 'Unflag' : 'Flag', disabled: !hasSel, onClick: () => act(sel?.isStarred ? 'unflag' : 'flag') },
      { label: sel?.isPinned ? 'Unpin' : 'Pin to top', disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.pin(selId, !sel?.isPinned).then(() => void mail.refresh()) } },
      { label: 'Archive', disabled: !hasSel, onClick: () => act('archive') },
      { label: 'Delete', disabled: !hasSel, onClick: () => act('trash') },
      { label: 'Block sender → Junk', disabled: !sel?.fromEmail, onClick: () => { if (sel?.fromEmail && selId != null) void window.deskmail.rules.create({ name: `Block ${sel.fromEmail} → Junk`, enabled: true, field: 'from', op: 'contains', value: sel.fromEmail, action: 'junk', targetFolderId: null, targetLabelId: null }).then(() => window.deskmail.mail.action(selId, 'junk')).then(() => void mail.refresh()) } },
      { label: 'Mark folder read', disabled: activeFolder == null, onClick: () => { if (activeFolder != null) void window.deskmail.mail.markFolderRead(activeFolder).then(() => void mail.refresh()) } },
      { label: 'Add to tasks', disabled: !hasSel, onClick: () => { if (sel && selId != null) void window.deskmail.tasks.create(sel.subject || '(no subject)', null, selId) } },
      { header: 'Snooze' },
      ...SNOOZE_OPTS.map((s): Item => ({ label: s.label, indent: true, disabled: !hasSel, onClick: () => { if (selId != null) void window.deskmail.mail.snooze(selId, s.opt).then(() => void mail.refresh()) } })),
      ...(labelItems.length ? [{ header: 'Categorise' } as Item, ...labelItems] : []),
      { header: 'Move to' },
      ...moveTo
    ],
    Help: [{ label: 'About DeskMail AI', onClick: () => onOpenSettings() }]
  }

  const btn = 'block cursor-pointer rounded-md px-2 py-[3px] text-[12.5px] hover:bg-raised'

  return (
    <div className="drag-region flex h-[38px] flex-none select-none items-center gap-1 border-b border-border bg-panel pl-3 pr-1.5">
      <img src={logo} alt="DeskMail AI" className="h-5 w-5 flex-none object-contain" />
      <span className="mr-3.5 text-[12.5px] font-bold tracking-[.2px]">
        DeskMail <span className="text-claude">AI</span>
      </span>

      <div ref={rootRef} className="no-drag flex gap-0.5 text-text-2">
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="relative">
            <span onClick={() => toggle(name)} className={btn} style={open === name ? { background: 'var(--bg-3)' } : undefined}>
              {name}
            </span>
            {open === name && <Dropdown items={items} onPick={close} />}
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-px">
        <button onClick={() => w.minimise()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Minimise">
          <Icon name="minimise" size={16} />
        </button>
        <button onClick={() => w.toggleMaximise()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-raised" title="Maximise">
          <Icon name="maximise" size={14} />
        </button>
        <button onClick={() => w.close()} className="flex h-[30px] w-11 items-center justify-center rounded-md text-text-2 hover:bg-danger hover:text-white" title="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  )
}
