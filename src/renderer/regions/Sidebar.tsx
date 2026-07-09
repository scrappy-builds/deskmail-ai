import { Icon, type IconName } from '../Icon'
import { accounts, folders, views } from '../mock/mailData'
import { useMail } from '../store/mailStore'

const folderIcon: Record<string, IconName> = {
  inbox: 'inbox',
  star: 'star',
  send: 'send',
  draft: 'draft',
  archive: 'archive',
  trash: 'trash'
}
const viewIcon: Record<string, IconName> = {
  compose: 'compose',
  star: 'star',
  calendar: 'calendar',
  search: 'search'
}

function Overline({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-2 pb-2 pt-1 text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">
      {children}
    </div>
  )
}

export function Sidebar({ showLabels }: { showLabels: boolean }): JSX.Element {
  const { activeFolderId, setFolder } = useMail()

  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-3">
      {showLabels && <Overline>Accounts</Overline>}
      {accounts.map((a) => (
        <div
          key={a.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] hover:bg-raised"
          title={a.email}
        >
          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: a.colour }} />
          {showLabels && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{a.name}</div>
              <div className="truncate text-[11px] text-text-3">{a.email}</div>
            </div>
          )}
          {showLabels && a.unread > 0 && (
            <span
              className="rounded-pill px-[7px] py-px text-[11px] font-bold text-accent"
              style={{ background: 'var(--accent-soft)' }}
            >
              {a.unread}
            </span>
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
            onClick={() => setFolder(f.id)}
            title={f.name}
            className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 hover:bg-hover"
            style={{
              justifyContent: showLabels ? 'flex-start' : 'center',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-2)'
            }}
          >
            <Icon name={folderIcon[f.icon]} size={18} className="flex-none" />
            {showLabels && (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate text-[13.5px]" style={{ fontWeight: active ? 700 : 500 }}>
                  {f.name}
                </span>
                {f.count > 0 && (
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: f.unread ? 'var(--accent)' : 'var(--text-3)' }}
                  >
                    {f.count}
                  </span>
                )}
              </div>
            )}
          </button>
        )
      })}

      <div className="h-3.5" />
      {showLabels && (
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[.7px] text-text-3">Custom Views</span>
          <span className="flex cursor-pointer text-text-3 hover:text-accent">
            <Icon name="plus" size={16} />
          </span>
        </div>
      )}
      {views.map((v) => (
        <button
          key={v.id}
          title={v.name}
          className="mb-px flex w-full items-center gap-3 rounded-md px-[9px] py-2 text-text-2 hover:bg-hover"
          style={{ justifyContent: showLabels ? 'flex-start' : 'center' }}
        >
          <Icon name={viewIcon[v.icon]} size={18} className="flex-none" />
          {showLabels && (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate text-[13.5px]">{v.name}</span>
              <span className="text-[11.5px] font-semibold text-text-3">{v.count}</span>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
