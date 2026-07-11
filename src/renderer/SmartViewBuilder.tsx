import { useState } from 'react'
import { Icon } from './Icon'
import type { SmartCondition, SmartField, SmartOp } from '@shared/db'
import { useMail } from './store/mailStore'
import { useToast } from './store/toastStore'

const FIELDS: { val: SmartField; label: string; flag?: boolean }[] = [
  { val: 'from', label: 'From' },
  { val: 'subject', label: 'Subject' },
  { val: 'to', label: 'To' },
  { val: 'body', label: 'Body' },
  { val: 'unread', label: 'Is unread', flag: true },
  { val: 'starred', label: 'Is starred', flag: true },
  { val: 'attachment', label: 'Has attachment', flag: true }
]
const OPS: { val: SmartOp; label: string }[] = [
  { val: 'contains', label: 'contains' },
  { val: 'equals', label: 'equals' },
  { val: 'startswith', label: 'starts with' }
]
const isFlag = (f: SmartField): boolean => f === 'unread' || f === 'starred' || f === 'attachment'

// Build and save a "smart view": a set of conditions matched all/any, saved to
// the sidebar and run on demand over the whole mailbox.
export function SmartViewBuilder({ onClose }: { onClose: () => void }): JSX.Element {
  const setSmartView = useMail((s) => s.setSmartView)
  const showToast = useToast((s) => s.show)
  const [name, setName] = useState('')
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [conds, setConds] = useState<SmartCondition[]>([{ field: 'from', op: 'contains', value: '' }])

  const setCond = (i: number, patch: Partial<SmartCondition>): void => setConds((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const addCond = (): void => setConds((c) => [...c, { field: 'subject', op: 'contains', value: '' }])
  const rmCond = (i: number): void => setConds((c) => c.filter((_, j) => j !== i))

  const save = async (): Promise<void> => {
    const usable = conds.filter((c) => isFlag(c.field) || c.value.trim())
    if (usable.length === 0) {
      showToast({ text: 'Add at least one condition.' })
      return
    }
    const { id } = await window.deskmail.smartViews.create({ name: name.trim() || 'Smart view', match, conditions: usable })
    onClose()
    void setSmartView(id)
  }

  return (
    <div className="absolute inset-0 z-[64] flex items-center justify-center" style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-[min(640px,93vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center border-b border-border px-5 py-4">
          <div className="text-[16px] font-bold">New smart view</div>
          <div className="flex-1" />
          <button onClick={onClose} className="flex rounded-md p-2 text-text-2 hover:bg-raised"><Icon name="close" size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Unpaid invoices)" className="mb-4 w-full rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:border-accent" />

          <div className="mb-3 flex items-center gap-2 text-[12.5px]">
            <span className="text-text-2">Match</span>
            <select value={match} onChange={(e) => setMatch(e.target.value as 'all' | 'any')} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
              <option value="all">all conditions</option>
              <option value="any">any condition</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            {conds.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <select value={c.field} onChange={(e) => setCond(i, { field: e.target.value as SmartField })} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
                  {FIELDS.map((f) => <option key={f.val} value={f.val}>{f.label}</option>)}
                </select>
                {!isFlag(c.field) && (
                  <>
                    <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value as SmartOp })} className="rounded-md border border-border bg-bg px-2 py-1.5 outline-none focus:border-accent">
                      {OPS.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>
                    <input value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder="value" className="min-w-[120px] flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent" />
                  </>
                )}
                {conds.length > 1 && (
                  <button onClick={() => rmCond(i)} className="rounded p-1 text-text-3 hover:text-danger"><Icon name="close" size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addCond} className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline">
            <Icon name="plus" size={14} /> Add condition
          </button>
        </div>

        <div className="flex flex-none justify-end gap-2.5 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Cancel</button>
          <button onClick={() => void save()} className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">Save & open</button>
        </div>
      </div>
    </div>
  )
}
