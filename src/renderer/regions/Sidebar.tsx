import { Icon, type IconName } from '../Icon'
import { useMail } from '../store/mailStore'

// Map a folder role/name to an icon.
function folderIcon(role: string | null, name: string): IconName {
  const r = (role ?? name).toLowerCase()
  if (r.includes('sent')) return 'send'
  if (r.includes('draft')) return 'draft'
  if (r.includes('trash') || r.includes('bin') || r.includes('junk')) return 'trash'
  if (r.includes('archive')) return 'archive'
  if (r.includes('star') || r.includes('flag')) return 'star'
  return 'inbox'
}

function Overline({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-2 pb-2 pt-1 text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">{children}</div>
}

export function Sidebar({ showLabels }: { showLabels: boolean }): JSX.Element {
  const { accounts, folders, activeFolderId, setFolder } = useMail()

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
      {showLabels && <Overline>Folders</Overline>}
      {folders.map((f) => {
        const active = f.id === activeFolderId
        return (
          <button
            key={f.id}
            onClick={() => void setFolder(f.id)}
            title={f.name}
            className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
            style={{
              justifyContent: showLabels ? 'flex-start' : 'center',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-2)'
            }}
          >
            <Icon name={folderIcon(f.role, f.name)} size={18} className="flex-none" />
            {showLabels && (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>
                  {f.name}
                </span>
                {f.unreadCount > 0 && (
                  <span className="text-[11.5px] font-semibold text-accent">{f.unreadCount}</span>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
