import { useState } from 'react'
import type { AccountInput, IncomingType, Security, TestResult } from '@shared/db'

type TestState = 'idle' | 'testing' | TestResult['code']

const SECURITY_OPTS: Security[] = ['ssl', 'starttls', 'none']

const DEFAULTS: AccountInput = {
  displayName: '',
  emailAddress: '',
  incomingType: 'imap',
  incomingHost: '',
  incomingPort: 993,
  incomingSecurity: 'ssl',
  outgoingHost: '',
  outgoingPort: 465,
  outgoingSecurity: 'ssl',
  username: '',
  password: ''
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-text-2">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'h-[38px] rounded-md border border-border bg-bg px-3 text-[13.5px] text-text outline-none focus:border-accent'

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { label: string; val: T }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="flex gap-1 rounded-md border border-border bg-inset p-[3px]">
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          onClick={() => onChange(o.val)}
          className="flex-1 rounded-sm px-2 py-1.5 text-[12px] font-semibold"
          style={o.val === value ? { color: 'var(--accent-fg)', background: 'var(--accent)' } : { color: 'var(--text-2)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Maps a test state to the FEATURE_SPEC connection label + colour.
function statusView(state: TestState, kind: 'Incoming' | 'Outgoing'): { text: string; colour: string } | null {
  switch (state) {
    case 'idle':
      return null
    case 'testing':
      return { text: 'Testing…', colour: 'var(--text-3)' }
    case 'ok':
      return { text: `${kind} OK`, colour: 'var(--green)' }
    case 'auth':
      return { text: 'Authentication failed', colour: 'var(--red)' }
    case 'server':
      return { text: 'Server settings incorrect', colour: 'var(--red)' }
  }
}

export function AccountWizard({
  onSaved,
  onCancel
}: {
  onSaved: () => void
  onCancel: () => void
}): JSX.Element {
  const [a, setA] = useState<AccountInput>(DEFAULTS)
  const [incoming, setIncoming] = useState<TestState>('idle')
  const [outgoing, setOutgoing] = useState<TestState>('idle')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]): void =>
    setA((prev) => ({ ...prev, [k]: v }))

  const canTest = a.username && a.password
  const canSave = a.displayName && a.emailAddress && a.incomingHost && a.outgoingHost && canTest

  const runIncoming = async (): Promise<void> => {
    setIncoming('testing')
    const r = await window.deskmail.testIncoming({
      type: a.incomingType,
      host: a.incomingHost,
      port: a.incomingPort,
      security: a.incomingSecurity,
      username: a.username,
      password: a.password
    })
    setIncoming(r.code)
  }

  const runOutgoing = async (): Promise<void> => {
    setOutgoing('testing')
    const r = await window.deskmail.testOutgoing({
      host: a.outgoingHost,
      port: a.outgoingPort,
      security: a.outgoingSecurity,
      username: a.username,
      password: a.password
    })
    setOutgoing(r.code)
  }

  const save = async (): Promise<void> => {
    setError(null)
    try {
      await window.deskmail.saveAccount(a)
      setSaved(true)
      // Give the "Account added" confirmation a beat, then return to the list.
      setTimeout(onSaved, 700)
    } catch (e) {
      setError((e as Error).message ?? 'I couldn’t save the account.')
    }
  }

  const inStatus = statusView(incoming, 'Incoming')
  const outStatus = statusView(outgoing, 'Outgoing')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[15px] font-bold">Add an account</div>
        <p className="mt-1 text-[12.5px] text-text-3">
          Enter your provider’s IMAP/POP3 and SMTP details. Test the connection, then save — your
          password is stored encrypted by Windows, never in plain text.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name">
          <input className={inputCls} value={a.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Jamie Bell" />
        </Field>
        <Field label="Email address">
          <input className={inputCls} value={a.emailAddress} onChange={(e) => set('emailAddress', e.target.value)} placeholder="jamie@example.com" />
        </Field>
      </div>

      {/* Incoming */}
      <div className="rounded-lg border border-border p-3.5">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Incoming mail</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Segmented<IncomingType>
              value={a.incomingType}
              options={[{ label: 'IMAP', val: 'imap' }, { label: 'POP3', val: 'pop3' }]}
              onChange={(v) => set('incomingType', v)}
            />
          </Field>
          <Field label="Security">
            <Segmented<Security>
              value={a.incomingSecurity}
              options={SECURITY_OPTS.map((s) => ({ label: s.toUpperCase(), val: s }))}
              onChange={(v) => set('incomingSecurity', v)}
            />
          </Field>
          <Field label="Host">
            <input className={inputCls} value={a.incomingHost} onChange={(e) => set('incomingHost', e.target.value)} placeholder="imap.example.com" />
          </Field>
          <Field label="Port">
            <input className={inputCls} type="number" value={a.incomingPort} onChange={(e) => set('incomingPort', Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={!canTest}
            onClick={runIncoming}
            className="rounded-md border border-border px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-raised disabled:opacity-40"
          >
            Test incoming
          </button>
          {inStatus && <span className="text-[12.5px] font-semibold" style={{ color: inStatus.colour }}>{inStatus.text}</span>}
        </div>
      </div>

      {/* Outgoing */}
      <div className="rounded-lg border border-border p-3.5">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Outgoing mail (SMTP)</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host">
            <input className={inputCls} value={a.outgoingHost} onChange={(e) => set('outgoingHost', e.target.value)} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port">
            <input className={inputCls} type="number" value={a.outgoingPort} onChange={(e) => set('outgoingPort', Number(e.target.value))} />
          </Field>
          <Field label="Security">
            <Segmented<Security>
              value={a.outgoingSecurity}
              options={SECURITY_OPTS.map((s) => ({ label: s.toUpperCase(), val: s }))}
              onChange={(v) => set('outgoingSecurity', v)}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={!canTest}
            onClick={runOutgoing}
            className="rounded-md border border-border px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-raised disabled:opacity-40"
          >
            Test outgoing
          </button>
          {outStatus && <span className="text-[12.5px] font-semibold" style={{ color: outStatus.colour }}>{outStatus.text}</span>}
        </div>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username">
          <input className={inputCls} value={a.username} onChange={(e) => set('username', e.target.value)} placeholder="Often your email address" />
        </Field>
        <Field label="Password">
          <input className={inputCls} type="password" value={a.password} onChange={(e) => set('password', e.target.value)} />
        </Field>
      </div>

      {error && <div className="text-[12.5px] font-semibold text-danger">{error}</div>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={!canSave || saved}
          onClick={save}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2 disabled:opacity-40"
        >
          {saved ? 'Account added' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">
          Cancel
        </button>
      </div>
    </div>
  )
}
