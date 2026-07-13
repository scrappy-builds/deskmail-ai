import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import { buildReplyDraft, type ReplyKind } from '../mail/reply'
import { planBulk, runBulk, type BulkOp } from '../mail/bulkOps'
import { flattenFolderTree } from '../mail/folderTree'
import { aggregateFlags } from '../mail/messageActions'
import { useMail } from '../store/mailStore'
import { useToast } from '../store/toastStore'

const MENU_W = 224
const SUB_W = 210

// One row in the context menu. Same visual language as the command-bar dropdowns
// (MailActions / Sidebar): hover paints `--accent-soft`, disabled greys out.
function MenuItem({ icon, label, onClick, danger, disabled }: { icon?: IconName; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold enabled:hover:bg-[var(--accent-soft)] enabled:hover:text-accent disabled:opacity-35"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-2)' }}
    >
      {icon && <Icon name={icon} size={14} className="flex-none opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

const Divider = (): JSX.Element => <div className="my-1 border-t border-border" />

interface Props {
  x: number
  y: number
  messageId: number
  onClose: () => void
}

// Right-click menu for a message row. Acts on the ticked set when the clicked
// row is part of it, otherwise on the single clicked message (mirrors the
// command bar's effectiveTargets). Closes on outside-click / Escape and is
// clamped inside the viewport.
export function MessageContextMenu({ x, y, messageId, onClose }: Props): JSX.Element | null {
  const messages = useMail((s) => s.messages)
  const folders = useMail((s) => s.folders)
  const accounts = useMail((s) => s.accounts)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const selected = useMail((s) => s.selected)
  const selectedIds = useMail((s) => s.selectedIds)
  const refresh = useMail((s) => s.refresh)
  const clearSelected = useMail((s) => s.clearSelected)
  const setUndo = useMail((s) => s.setUndo)
  const showToast = useToast((s) => s.show)

  const rootRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveLeft, setMoveLeft] = useState(false)

  // Clamp the panel inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let nx = x
    let ny = y
    if (x + r.width > window.innerWidth) nx = Math.max(4, window.innerWidth - r.width - 4)
    if (y + r.height > window.innerHeight) ny = Math.max(4, window.innerHeight - r.height - 4)
    setPos({ x: nx, y: ny })
    // The Move flyout opens leftwards if it would spill off the right edge.
    setMoveLeft(nx + r.width + SUB_W + 8 > window.innerWidth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const msg = messages.find((m) => m.id === messageId)
  if (!msg) return null

  // Targets: the ticked set if the clicked row belongs to it, else the clicked row.
  const actedOnSelection = selectedIds.has(messageId) && selectedIds.size > 0
  const ids = actedOnSelection ? [...selectedIds] : [messageId]
  const single = ids.length === 1
  const flags = aggregateFlags(messages, ids, selected)
  const activeRole = folders.find((f) => f.id === activeFolderId)?.role
  // In Trash or Junk, Delete is permanent (behind a confirm); everywhere else it
  // means move-to-Bin. Same rule as the command bar.
  const hardDelete = activeRole === 'trash' || activeRole === 'junk'
  // Reply/forward need the full message detail from the reading pane; only sensible
  // for a single message that's the one currently open (we select it on open).
  const replyReady = single && selected?.id === messageId
  const canSender = single && !!msg.fromEmail
  const moveTargets = flattenFolderTree(folders).filter((n) => n.folder.id !== activeFolderId)

  // After a mutating action: refresh, drop any multi-selection we acted on, toast, close.
  const finish = async (toast: string): Promise<void> => {
    await refresh()
    if (actedOnSelection) clearSelected()
    showToast({ text: toast })
    onClose()
  }
  const runOp = async (op: BulkOp, toast: string, targetFolderId?: number): Promise<void> => {
    // Reversible ops (move/trash/archive) record an Undo for the Edit menu, just
    // like the command-bar ribbon — right-click actions were the odd one out.
    if ((op === 'move' || op === 'delete' || op === 'archive') && activeFolderId != null) {
      const undoIds = [...ids]
      const back = activeFolderId
      setUndo({ label: toast, run: () => { for (const uid of undoIds) void window.deskmail.mail.action(uid, 'move', back); void refresh() } })
    }
    await runBulk(planBulk(op, ids, targetFolderId))
    await finish(toast)
  }
  const applyEach = async (fn: (id: number) => Promise<void>, toast: string): Promise<void> => {
    for (const id of ids) await fn(id)
    await finish(toast)
  }

  const deleteSelected = (): void => {
    if (hardDelete) {
      if (!window.confirm(`Permanently delete ${ids.length} message${ids.length > 1 ? 's' : ''}? This can't be undone.`)) return
      void applyEach((id) => window.deskmail.mail.action(id, 'delete-forever'), 'Permanently deleted')
    } else {
      void runOp('delete', 'Moved to Bin')
    }
  }

  const startReply = (kind: ReplyKind): void => {
    if (!selected) return
    const selfEmail = accounts.find((a) => a.id === selected.accountId)?.emailAddress
    const payload = buildReplyDraft(selected, kind, selfEmail)
    void window.deskmail.compose.saveDraft(payload).then(({ id }) => window.deskmail.openCompose(id))
    onClose()
  }

  const createRuleFromSender = (): void => {
    const folder = folders.find((f) => f.id === activeFolderId)
    if (!msg.fromEmail || !folder) {
      showToast({ text: 'Open the message from a folder to base a rule on it.' })
      onClose()
      return
    }
    void window.deskmail.rules
      .create({ name: `From ${msg.fromEmail} → ${folder.name}`, enabled: true, field: 'from', op: 'contains', value: msg.fromEmail, action: 'move', targetFolderId: folder.id, targetLabelId: null })
      .then(() => showToast({ text: `Rule added: mail from ${msg.fromEmail} → ${folder.name}. Tune it in Settings → Rules.` }))
    onClose()
  }

  const addToContacts = (): void => {
    if (!msg.fromEmail) return
    void window.deskmail.contacts
      .create({ name: msg.fromName, email: msg.fromEmail, org: null, notes: null, groups: [] })
      .then(() => showToast({ text: `Added ${msg.fromName || msg.fromEmail} to contacts` }))
      .catch((err) => showToast({ text: err instanceof Error ? err.message : 'Couldn’t add to contacts' }))
    onClose()
  }

  const copyEmail = (): void => {
    if (!msg.fromEmail) return
    void navigator.clipboard.writeText(msg.fromEmail)
    showToast({ text: 'Copied' })
    onClose()
  }

  const createTask = (): void => {
    void window.deskmail.tasks.create(msg.subject || '(no subject)', null, msg.id).then(() => showToast({ text: 'Task created' }))
    onClose()
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      className="fixed z-50 rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised"
      style={{ left: pos.x, top: pos.y, width: MENU_W }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem icon="reply" label="Reply" disabled={!replyReady} onClick={() => startReply('reply')} />
      <MenuItem icon="replyAll" label="Reply to all" disabled={!replyReady} onClick={() => startReply('replyAll')} />
      <MenuItem icon="forward" label="Forward" disabled={!replyReady} onClick={() => startReply('forward')} />
      <Divider />
      <MenuItem icon="archive" label="Archive" onClick={() => void runOp('archive', 'Archived')} />

      {/* Move to ▸ — folder flyout, opens left when it would spill off-screen. */}
      <div className="relative" onMouseEnter={() => setMoveOpen(true)} onMouseLeave={() => setMoveOpen(false)}>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-2 hover:bg-[var(--accent-soft)] hover:text-accent"
        >
          <Icon name="draft" size={14} className="flex-none opacity-80" />
          <span className="min-w-0 flex-1 truncate">Move to</span>
          <Icon name="chevronDown" size={12} className="flex-none -rotate-90 opacity-60" />
        </button>
        {moveOpen && (
          <div
            className="absolute top-0 z-50 max-h-[320px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised"
            style={{ width: SUB_W, left: moveLeft ? undefined : '100%', right: moveLeft ? '100%' : undefined }}
          >
            <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Move to…</div>
            {moveTargets.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[12px] text-text-3">No other folders.</div>
            ) : (
              moveTargets.map(({ folder: f }) => (
                <MenuItem key={f.id} label={f.name} onClick={() => void runOp('move', `Moved to ${f.name}`, f.id)} />
              ))
            )}
          </div>
        )}
      </div>

      <MenuItem
        icon="star"
        label={flags.anyUnflagged ? 'Flag' : 'Unflag'}
        onClick={() => void runOp(flags.anyUnflagged ? 'flag' : 'unflag', flags.anyUnflagged ? 'Flagged' : 'Unflagged')}
      />
      <MenuItem
        icon={flags.anyUnread ? 'check' : 'markUnread'}
        label={flags.anyUnread ? 'Mark read' : 'Mark unread'}
        onClick={() => void runOp(flags.anyUnread ? 'read' : 'unread', flags.anyUnread ? 'Marked read' : 'Marked unread')}
      />
      <MenuItem icon="trash" label={hardDelete ? 'Delete forever' : 'Delete'} danger onClick={deleteSelected} />
      <Divider />
      <MenuItem icon="sliders" label="Create rule from sender" disabled={!canSender} onClick={createRuleFromSender} />
      <MenuItem icon="contacts" label="Add sender to contacts" disabled={!canSender} onClick={addToContacts} />
      <MenuItem icon="mail" label="Copy email address" disabled={!canSender} onClick={copyEmail} />
      <MenuItem icon="check" label="Create task from this email" disabled={!single} onClick={createTask} />
    </div>
  )
}
