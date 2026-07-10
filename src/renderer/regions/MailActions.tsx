import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import type { SnoozeOption } from '@shared/db'
import { buildReplyDraft, type ReplyKind } from '../mail/reply'
import { planBulk, runBulk, type BulkOp } from '../mail/bulkOps'
import { flattenFolderTree } from '../mail/folderTree'
import { aggregateFlags, effectiveTargets } from '../mail/messageActions'
import { useMail } from '../store/mailStore'
import { useToast } from '../store/toastStore'

const SNOOZE_OPTS: { label: string; opt: SnoozeOption }[] = [
  { label: 'Later today', opt: 'later' },
  { label: 'Tomorrow', opt: 'tomorrow' },
  { label: 'This weekend', opt: 'weekend' },
  { label: 'Next week', opt: 'nextweek' }
]

// One icon+label button in the command-bar action group. Greys out (and stops
// responding) when its action doesn't apply to the current selection.
function Btn({ icon, label, onClick, danger, active, disabled }: { icon: IconName; label: string; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex flex-none items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold enabled:hover:bg-raised disabled:cursor-default disabled:opacity-35"
      style={{ color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text-2)' }}
    >
      <Icon name={icon} size={15} fill={active && icon === 'star'} />
      <span>{label}</span>
    </button>
  )
}

const Divider = (): JSX.Element => <div className="mx-1 h-5 w-px flex-none bg-border" />

// A button that opens a small dropdown panel; closes on outside click. `render`
// gets a `close` fn to dismiss after a choice.
function Dropdown({ icon, label, disabled, render }: { icon: IconName; label: string; disabled?: boolean; render: (close: () => void) => JSX.Element }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative flex-none">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={label}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-text-2 enabled:hover:bg-raised disabled:cursor-default disabled:opacity-35"
      >
        <Icon name={icon} size={15} />
        <span>{label}</span>
        <Icon name="chevronDown" size={12} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[320px] w-[210px] overflow-y-auto rounded-lg border border-border-2 bg-panel p-1.5 shadow-raised">
          {render(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger, disabled, indent = 0 }: { icon?: IconName; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; indent?: number }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-semibold enabled:hover:bg-[var(--accent-soft)] enabled:hover:text-accent disabled:opacity-35"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-2)', paddingLeft: 10 + indent * 14 }}
    >
      {icon && <Icon name={icon} size={14} className="flex-none opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

// The message-action ribbon that lives in the top command bar (Mail mode only).
// Acts on the ticked messages if any are ticked, else the message open in the
// reading pane. Buttons grey out when they don't apply to the current selection.
export function MailActions(): JSX.Element {
  const selected = useMail((s) => s.selected)
  const selectedId = useMail((s) => s.selectedId)
  const selectedIds = useMail((s) => s.selectedIds)
  const messages = useMail((s) => s.messages)
  const folders = useMail((s) => s.folders)
  const labels = useMail((s) => s.labels)
  const accounts = useMail((s) => s.accounts)
  const activeFolderId = useMail((s) => s.activeFolderId)
  const refresh = useMail((s) => s.refresh)
  const clearSelected = useMail((s) => s.clearSelected)
  const setUndo = useMail((s) => s.setUndo)
  const showToast = useToast((s) => s.show)

  const ids = effectiveTargets(selectedIds, selectedId)
  const has = ids.length > 0
  const single = ids.length === 1
  const flags = aggregateFlags(messages, ids, selected)
  // Reply/forward act on the message open in the reading pane — only sensible
  // for a single message, so they're off when several are ticked.
  const replyEnabled = selected != null && selectedIds.size <= 1
  const activeRole = folders.find((f) => f.id === activeFolderId)?.role
  const inJunk = activeRole === 'junk'
  const inboxId = folders.find((f) => f.role === 'inbox')?.id
  // In Trash or Junk, Delete means permanent delete (there's nowhere left to move to).
  const hardDelete = activeRole === 'trash' || activeRole === 'junk'

  const deleteSelected = (): void => {
    if (!has) return
    if (hardDelete) {
      if (!window.confirm(`Permanently delete ${ids.length} message${ids.length > 1 ? 's' : ''}? This can't be undone.`)) return
      void applyEach((id) => window.deskmail.mail.action(id, 'delete-forever'), 'Permanently deleted')
    } else {
      void runOp('delete', 'Moved to Bin')
    }
  }

  // Run every selected message through the bulk planner/runner, then refresh,
  // clear any tick selection, and confirm with a toast.
  const runOp = async (op: BulkOp, toast: string, targetFolderId?: number): Promise<void> => {
    if (!has) return
    // Reversible ops (move/trash/archive) leave everything they touched movable
    // back to where it was — record an Undo for the Edit menu.
    if ((op === 'move' || op === 'delete' || op === 'archive') && activeFolderId != null) {
      const undoIds = [...ids]
      const back = activeFolderId
      setUndo({ label: toast, run: () => { for (const uid of undoIds) void window.deskmail.mail.action(uid, 'move', back); void refresh() } })
    }
    await runBulk(planBulk(op, ids, targetFolderId))
    await refresh()
    if (selectedIds.size > 0) clearSelected()
    showToast({ text: toast })
  }
  // Same shape, for the ops that aren't part of the bulk planner (pin/mute/snooze/label).
  const applyEach = async (fn: (id: number) => Promise<void>, toast: string): Promise<void> => {
    if (!has) return
    for (const id of ids) await fn(id)
    await refresh()
    if (selectedIds.size > 0) clearSelected()
    showToast({ text: toast })
  }

  const startReply = (kind: ReplyKind): void => {
    if (!selected) return
    const selfEmail = accounts.find((a) => a.id === selected.accountId)?.emailAddress
    const payload = buildReplyDraft(selected, kind, selfEmail)
    void window.deskmail.compose.saveDraft(payload).then(({ id }) => window.deskmail.openCompose(id))
  }

  // Sidebar-ordered, de-duplicated folder list (Inbox + its subfolders, Sent,
  // Junk, Trash, Archive, then custom folders), minus the folder we're already in.
  const moveTargets = flattenFolderTree(folders).filter((n) => n.folder.id !== activeFolderId)

  // Block sender: add a rule routing this sender to Junk, and junk the open message now.
  const blockSender = (): void => {
    if (!selected?.fromEmail) return
    const from = selected.fromEmail
    void window.deskmail.rules
      .create({ name: `Block ${from} → Junk`, enabled: true, field: 'from', op: 'contains', value: from, action: 'junk', targetFolderId: null, targetLabelId: null })
      .then(() => window.deskmail.mail.action(selected.id, 'junk'))
      .then(() => { void refresh(); showToast({ text: `Blocked ${from} — mail from them now goes to Junk` }) })
  }

  const createRuleFromSender = (): void => {
    if (!selected?.fromEmail) return
    const folder = folders.find((f) => f.id === activeFolderId)
    if (!folder) {
      showToast({ text: 'Open the message from a folder to base a rule on it.' })
      return
    }
    void window.deskmail.rules
      .create({ name: `From ${selected.fromEmail} → ${folder.name}`, enabled: true, field: 'from', op: 'contains', value: selected.fromEmail, action: 'move', targetFolderId: folder.id, targetLabelId: null })
      .then(() => showToast({ text: `Rule added: mail from ${selected.fromEmail} → ${folder.name}. Tune it in Settings → Rules.` }))
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Btn icon="reply" label="Reply" disabled={!replyEnabled} onClick={() => startReply('reply')} />
      <Btn icon="replyAll" label="Reply all" disabled={!replyEnabled} onClick={() => startReply('replyAll')} />
      <Btn icon="forward" label="Forward" disabled={!replyEnabled} onClick={() => startReply('forward')} />
      <Divider />
      <Btn icon="trash" label={hardDelete ? 'Delete forever' : 'Delete'} danger disabled={!has} onClick={deleteSelected} />
      <Btn icon="archive" label="Archive" disabled={!has} onClick={() => void runOp('archive', 'Archived')} />
      <Dropdown icon="draft" label="Move to" disabled={!has}
        render={(close) => (
          <>
            <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Move to…</div>
            {moveTargets.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[12px] text-text-3">No other folders.</div>
            ) : (
              moveTargets.map(({ folder: f, depth }) => <MenuItem key={f.id} label={f.name} indent={depth} onClick={() => { close(); void runOp('move', `Moved to ${f.name}`, f.id) }} />)
            )}
          </>
        )}
      />
      <Divider />
      <Btn
        icon={flags.anyUnread ? 'check' : 'markUnread'}
        label={flags.anyUnread ? 'Read' : 'Unread'}
        disabled={!has}
        onClick={() => void runOp(flags.anyUnread ? 'read' : 'unread', flags.anyUnread ? 'Marked read' : 'Marked unread')}
      />
      <Btn
        icon="star"
        label={flags.anyUnflagged ? 'Flag' : 'Unflag'}
        active={has && !flags.anyUnflagged}
        disabled={!has}
        onClick={() => void runOp(flags.anyUnflagged ? 'flag' : 'unflag', flags.anyUnflagged ? 'Flagged' : 'Unflagged')}
      />
      <Dropdown icon="clock" label="Snooze" disabled={!has}
        render={(close) => (
          <>
            {SNOOZE_OPTS.map((s) => (
              <MenuItem key={s.opt} label={s.label} onClick={() => { close(); void applyEach((id) => window.deskmail.mail.snooze(id, s.opt), `Snoozed until ${s.label.toLowerCase()}`) }} />
            ))}
          </>
        )}
      />

      {inJunk && inboxId != null && (
        <Btn icon="inbox" label="Not junk" disabled={!has} onClick={() => void runOp('move', 'Moved to Inbox', inboxId)} />
      )}

      <Dropdown icon="sliders" label="More" disabled={!has}
        render={(close) => (
          <>
            <MenuItem
              icon="pin"
              label={flags.anyUnpinned ? 'Pin to top' : 'Unpin'}
              onClick={() => { close(); void applyEach((id) => window.deskmail.mail.pin(id, flags.anyUnpinned), flags.anyUnpinned ? 'Pinned to top' : 'Unpinned') }}
            />
            <div className="my-1 border-t border-border" />
            <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.6px] text-text-3">Categorise</div>
            {labels.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[12px] text-text-3">No labels yet — add one in Settings.</div>
            ) : (
              labels.map((l) => (
                <MenuItem
                  key={l.id}
                  icon="check"
                  label={l.name}
                  onClick={() => { close(); void applyEach((id) => window.deskmail.labels.toggle(id, l.id, true), `Labelled “${l.name}”`) }}
                />
              ))
            )}
            <div className="my-1 border-t border-border" />
            <MenuItem icon="print" label="Print to PDF" disabled={!single} onClick={() => { close(); void window.deskmail.mail.printPdf(ids[0]).then((r) => { if (r.path) showToast({ text: 'Saved as PDF' }) }) }} />
            <MenuItem icon="openWindow" label="Open in window" disabled={!single} onClick={() => { close(); window.deskmail.openMessage(ids[0]) }} />
            <MenuItem icon="draft" label="Export to NotebookLM" disabled={!single || !selected} onClick={() => { close(); if (selected) void window.deskmail.notebooklm.export(selected.id, selected.attachments.length > 0).then((r) => showToast({ text: r.note ? `Exported to NotebookLM folder (${r.note})` : `Exported ${r.files.length} file(s) for NotebookLM` })) }} />
            <MenuItem icon="shield" label="Block sender → Junk" disabled={!single || !selected?.fromEmail} onClick={() => { close(); blockSender() }} />
            <MenuItem icon="sliders" label="Create rule from sender" disabled={!single || !selected?.fromEmail} onClick={() => { close(); createRuleFromSender() }} />
          </>
        )}
      />
    </div>
  )
}
