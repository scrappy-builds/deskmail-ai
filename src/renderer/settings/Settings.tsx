import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { AccountSummary } from '@shared/db'
import { AccountWizard } from './AccountWizard'
import { ClaudeConnectorPane, ContactsPane, SendingPane, SignaturesPane, TemplatesPane } from './panes'

const SECTIONS = [
  'Accounts',
  'Signatures',
  'Templates',
  'Contacts',
  'Sending',
  'Meetings',
  'Claude connector',
  'Appearance',
  'Security',
  'Local storage',
  'About'
] as const
type Section = (typeof SECTIONS)[number]

function AccountsPane(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [adding, setAdding] = useState(false)

  const refresh = (): void => {
    void window.deskmail.listAccounts().then(setAccounts)
  }
  useEffect(refresh, [])

  if (adding) {
    return (
      <AccountWizard
        onSaved={() => {
          setAdding(false)
          refresh()
        }}
        onCancel={() => setAdding(false)}
      />
    )
  }

  return (
    <div>
      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-2 p-6 text-center">
          <div className="text-[14px] font-bold text-text-2">No accounts yet</div>
          <p className="mx-auto mt-1.5 max-w-[360px] text-[12.5px] leading-relaxed text-text-3">
            Add your first mailbox to start syncing. I keep everything local — your mail lives on this
            PC, and your password is encrypted by Windows.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3.5 py-3">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: acc.colour ?? 'var(--accent)' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{acc.displayName}</div>
                <div className="truncate text-[12px] text-text-3">{acc.emailAddress}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        className="mt-4 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
      >
        <Icon name="plus" size={16} /> Add account
      </button>
    </div>
  )
}

function Placeholder({ name }: { name: Section }): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-border-2 p-6 text-[13px] leading-relaxed text-text-3">
      <span className="font-semibold text-text-2">{name}</span> settings arrive in a later stage. I'm
      building DeskMail in stages so each part is solid before I move on.
    </div>
  )
}

export function Settings({ onClose }: { onClose: () => void }): JSX.Element {
  const [section, setSection] = useState<Section>('Accounts')

  return (
    <div
      className="absolute inset-0 z-[62] flex items-center justify-center"
      style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="flex h-[min(620px,90vh)] w-[min(900px,93vw)] overflow-hidden rounded-lg border border-border bg-panel shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        {/* left nav */}
        <div className="flex w-[222px] flex-none flex-col border-r border-border bg-bg p-2.5">
          <div className="px-2.5 pb-3.5 pt-1 text-[16px] font-bold">Settings</div>
          {SECTIONS.map((s) => {
            const active = s === section
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className="mb-px rounded-md px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-raised"
                style={active ? { color: 'var(--accent)', background: 'var(--accent-soft)' } : { color: 'var(--text-2)' }}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* right pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none items-center border-b border-border px-5 py-4">
            <span className="text-[16px] font-bold">{section}</span>
            <div className="flex-1" />
            <button onClick={onClose} className="flex rounded-md p-2 text-text-2 hover:bg-raised">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {section === 'Accounts' && <AccountsPane />}
            {section === 'Signatures' && <SignaturesPane />}
            {section === 'Templates' && <TemplatesPane />}
            {section === 'Contacts' && <ContactsPane />}
            {section === 'Sending' && <SendingPane />}
            {section === 'Claude connector' && <ClaudeConnectorPane />}
            {section !== 'Accounts' &&
              section !== 'Signatures' &&
              section !== 'Templates' &&
              section !== 'Contacts' &&
              section !== 'Sending' &&
              section !== 'Claude connector' && <Placeholder name={section} />}
          </div>
        </div>
      </div>
    </div>
  )
}
