import { useEffect, useRef, useState } from 'react'
import { TitleBar } from './TitleBar'
import { useMail } from './store/mailStore'
import { useToast } from './store/toastStore'
import { installShortcuts } from './shortcuts'
import { ShortcutHelp } from './ShortcutHelp'
import { buildReplyDraft } from './mail/reply'
import { DEFAULT_KEYMAP, type Keymap } from '@shared/shortcuts'
import type { AccountInput, MailOp } from '@shared/db'
import { CommandBar, type Mode } from './CommandBar'
import { Workspace } from './regions/Workspace'
import { ViewSettings } from './ViewSettings'
import { Settings } from './settings/Settings'
import { DraftsModal } from './compose/DraftsModal'
import { OutboxModal } from './compose/OutboxModal'
import { SmartViewBuilder } from './SmartViewBuilder'
import { AttachmentsBrowser } from './mail/AttachmentsBrowser'
import { Calendar } from './calendar/Calendar'
import { Toast } from './Toast'
import { useCalendar } from './store/calendarStore'

// Draw a round unread badge (red circle + count) as a PNG data URL for the taskbar.
function drawBadge(n: number): string | null {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#d64545'
  ctx.beginPath()
  ctx.arc(16, 16, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(n > 99 ? '99+' : String(n), 16, 17)
  return c.toDataURL('image/png')
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mail')
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // When the MCP connector stages an account, open Settings → Accounts with the
  // wizard pre-filled (password blank) for the user to finish.
  const [setupPrefill, setSetupPrefill] = useState<AccountInput | null>(null)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const [smartBuilderOpen, setSmartBuilderOpen] = useState(false)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [shortcutCfg, setShortcutCfg] = useState<{ enabled: boolean; map: Keymap }>({ enabled: false, map: DEFAULT_KEYMAP })
  const openNewEvent = useCalendar((s) => s.openNew)
  const folders = useMail((s) => s.folders)

  const reloadShortcuts = (): void => void window.deskmail.shortcuts.get().then(setShortcutCfg)
  useEffect(reloadShortcuts, [])

  // The MCP connector staged an account for the user → pop Settings with it.
  useEffect(() => window.deskmail.onOpenAccountSetup((input) => {
    setSetupPrefill(input)
    setSettingsOpen(true)
  }), [])

  // Global keyboard shortcuts. The listener mounts once and reads the live config
  // through a ref each keypress, so remaps and the master toggle apply instantly
  // and without re-binding. Shortcuts are gated to Mail mode with no modal open.
  const anyModalOpen = viewSettingsOpen || settingsOpen || draftsOpen || outboxOpen || smartBuilderOpen || attachmentsOpen || shortcutHelpOpen
  const gateRef = useRef({ enabled: false, map: DEFAULT_KEYMAP as Keymap, active: false })
  gateRef.current = { enabled: shortcutCfg.enabled, map: shortcutCfg.map, active: mode === 'mail' && !anyModalOpen }
  useEffect(() => {
    const quick = (op: MailOp, toast: string): void => {
      const s = useMail.getState()
      const id = s.selectedId
      if (id == null) return
      void window.deskmail.mail.action(id, op).then(() => {
        void s.refresh()
        useToast.getState().show({ text: toast })
      })
    }
    // Open a compose window prefilled from the selected message (reply / reply-all / forward).
    const draftFromSelected = (kind: Parameters<typeof buildReplyDraft>[1]): void => {
      const s = useMail.getState()
      const sel = s.selected
      if (!sel) return
      const selfEmail = s.accounts.find((a) => a.id === sel.accountId)?.emailAddress
      void window.deskmail.compose.saveDraft(buildReplyDraft(sel, kind, selfEmail)).then(({ id }) => window.deskmail.openCompose(id))
    }
    return installShortcuts(
      () => ({ enabled: gateRef.current.enabled && gateRef.current.active, map: gateRef.current.map }),
      {
        nextMessage: () => void useMail.getState().selectNext(),
        prevMessage: () => void useMail.getState().selectPrev(),
        open: () => {
          const id = useMail.getState().selectedId
          if (id != null) window.deskmail.openMessage(id)
        },
        archive: () => quick('archive', 'Archived'),
        delete: () => quick('trash', 'Moved to Bin'),
        flagToggle: () => {
          const sel = useMail.getState().selected
          if (!sel) return
          quick(sel.isStarred ? 'unflag' : 'flag', sel.isStarred ? 'Unflagged' : 'Flagged')
        },
        reply: () => draftFromSelected('reply'),
        replyAll: () => draftFromSelected('replyAll'),
        forward: () => draftFromSelected('forward'),
        compose: () => window.deskmail.openCompose(),
        search: () => (document.getElementById('deskmail-search') as HTMLInputElement | null)?.focus(),
        toggleUnread: () => {
          const sel = useMail.getState().selected
          if (!sel) return
          quick(sel.isRead ? 'unread' : 'read', sel.isRead ? 'Marked unread' : 'Marked read')
        },
        markAllRead: () => {
          const s = useMail.getState()
          const fid = s.activeFolderId
          if (fid == null) return
          void window.deskmail.mail.markFolderRead(fid).then(({ count }) => {
            void s.refresh()
            useToast.getState().show({ text: count > 0 ? `Marked ${count} as read` : 'Nothing unread here' })
          })
        },
        selectAll: () => {
          const s = useMail.getState()
          s.selectAll(s.messages.map((m) => m.id))
        },
        help: () => setShortcutHelpOpen(true)
      }
    )
  }, [])

  // Windows taskbar unread badge: draw a small PNG from the total Inbox unread and
  // hand it to the main process (or clear it at zero).
  useEffect(() => {
    const unread = folders.filter((f) => f.role === 'inbox').reduce((s, f) => s + f.unreadCount, 0)
    window.deskmail.setBadge(unread > 0 ? drawBadge(unread) : null)
  }, [folders])

  // Compose opens in its own resizable window (not an in-app overlay).
  const openCompose = (): void => window.deskmail.openCompose()

  // The command-bar primary button is New event in calendar, Compose otherwise.
  const onPrimary = (): void => (mode === 'calendar' ? openNewEvent() : openCompose())

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar
        onOpenSettings={() => setSettingsOpen(true)}
        onCompose={openCompose}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onMode={(m) => setMode(m)}
        onOpenAttachments={() => setAttachmentsOpen(true)}
      />
      <CommandBar
        mode={mode}
        onMode={setMode}
        onOpenViewSettings={() => setViewSettingsOpen(true)}
        onCompose={onPrimary}
      />

      {mode === 'mail' && (
        <Workspace
          onOpen={(id) => window.deskmail.openMessage(id)}
          onOpenDrafts={() => setDraftsOpen(true)}
          onOpenOutbox={() => setOutboxOpen(true)}
          onOpenSmartBuilder={() => setSmartBuilderOpen(true)}
        />
      )}
      {mode === 'calendar' && <Calendar />}

      {viewSettingsOpen && <ViewSettings onClose={() => setViewSettingsOpen(false)} />}
      {settingsOpen && <Settings initialAccountSetup={setupPrefill} onClose={() => { setSettingsOpen(false); setSetupPrefill(null); reloadShortcuts() }} />}
      {draftsOpen && (
        <DraftsModal
          onClose={() => setDraftsOpen(false)}
          onEdit={(d) => {
            setDraftsOpen(false)
            window.deskmail.openCompose(d.id)
          }}
        />
      )}
      {outboxOpen && <OutboxModal onClose={() => setOutboxOpen(false)} />}
      {smartBuilderOpen && <SmartViewBuilder onClose={() => setSmartBuilderOpen(false)} />}
      {attachmentsOpen && <AttachmentsBrowser onClose={() => setAttachmentsOpen(false)} />}
      {shortcutHelpOpen && <ShortcutHelp map={shortcutCfg.map} onClose={() => setShortcutHelpOpen(false)} />}
      <Toast />
    </div>
  )
}
