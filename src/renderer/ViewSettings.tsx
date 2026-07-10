import { Icon } from './Icon'
import { PRESET_LABELS, type LayoutPreferences, type LayoutPreset } from '@shared/layout'
import { useLayout } from './store/layoutStore'
import { useMail } from './store/mailStore'

const PRESET_CARDS: { key: Exclude<LayoutPreset, 'custom'>; desc: string }[] = [
  { key: 'classic', desc: 'Sidebar, list, reading pane on the right.' },
  { key: 'bottom', desc: 'List on top, reading pane below.' },
  { key: 'focus', desc: 'Collapsed sidebar, large reading pane.' },
  { key: 'wide', desc: 'Wide layout with a large reading pane.' },
  { key: 'right', desc: 'Folders and accounts on the right.' },
  { key: 'noreading', desc: 'List only; messages open in windows.' }
]

// Tiny schematic mirroring each preset's arrangement (sidebar / list / reading).
function Schematic({ preset }: { preset: Exclude<LayoutPreset, 'custom'> }): JSX.Element {
  const box = (flex: number, key: string, muted = false): JSX.Element => (
    <div key={key} className="rounded-sm" style={{ flex, background: muted ? 'var(--bg-2)' : 'var(--border-2)' }} />
  )
  const sidebar = box(preset === 'focus' ? 0.4 : 1, 's')
  const list = box(1.4, 'l', true)
  const reading = box(2, 'r')

  if (preset === 'noreading') {
    return <div className="flex h-full w-full gap-1">{[sidebar, box(3.4, 'l', true)]}</div>
  }
  if (preset === 'bottom') {
    return (
      <div className="flex h-full w-full gap-1">
        {sidebar}
        <div className="flex flex-[3.4] flex-col gap-1">
          {box(1, 'l', true)}
          {box(1, 'r')}
        </div>
      </div>
    )
  }
  if (preset === 'right') {
    return <div className="flex h-full w-full gap-1">{[list, reading, sidebar]}</div>
  }
  if (preset === 'wide') {
    return <div className="flex h-full w-full gap-1">{[sidebar, list, reading, box(0.8, 'c')]}</div>
  }
  // classic | focus
  return <div className="flex h-full w-full gap-1">{[sidebar, list, reading]}</div>
}

function Segmented<T extends string>({
  label,
  value,
  options
}: {
  label: string
  value: T
  options: { label: string; val: T; on: () => void }[]
}): JSX.Element {
  return (
    <div>
      <div className="mb-[7px] text-[12.5px] font-semibold">{label}</div>
      <div className="flex gap-1 rounded-md border border-border bg-inset p-[3px]">
        {options.map((o) => {
          const active = o.val === value
          return (
            <button
              key={o.label}
              onClick={o.on}
              className="flex-1 rounded-sm px-2 py-1.5 text-center text-[12px] font-semibold"
              style={active ? { color: 'var(--accent-fg)', background: 'var(--accent)' } : { color: 'var(--text-2)' }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ViewSettings({ onClose }: { onClose: () => void }): JSX.Element {
  const { prefs, usePreset, setPref } = useLayout()
  const threading = useMail((s) => s.threading)
  const setThreading = useMail((s) => s.setThreading)
  const set = <K extends keyof LayoutPreferences>(k: K, v: LayoutPreferences[K]) => () => setPref(k, v)

  // "Reading pane" collapses position + visibility into one control.
  const rpValue = prefs.readingPaneVisible ? prefs.readingPanePosition : 'hidden'

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(920px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center border-b border-border px-5 py-4">
          <div>
            <div className="text-[17px] font-bold">View Settings</div>
            <div className="mt-px text-[12.5px] text-text-3">Choose a preset or fine-tune every panel.</div>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="flex rounded-md p-2 text-text-2 hover:bg-raised">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Layout Presets</div>
          <div className="mb-6 grid grid-cols-3 gap-3">
            {PRESET_CARDS.map(({ key, desc }) => {
              const active = prefs.selectedLayoutPreset === key
              return (
                <button
                  key={key}
                  onClick={() => usePreset(key)}
                  className="rounded-lg border-[1.5px] p-3 text-left hover:border-accent"
                  style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', background: active ? 'var(--accent-soft)' : 'transparent' }}
                >
                  <div className="mb-2.5 flex h-16 gap-1 rounded-md bg-inset p-1.5">
                    <Schematic preset={key} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold">{PRESET_LABELS[key]}</span>
                    {active && <Icon name="check" size={14} className="text-accent" />}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-tight text-text-3">{desc}</div>
                </button>
              )
            })}
          </div>

          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">Fine-tune</div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <Segmented
              label="Reading pane"
              value={rpValue}
              options={[
                { label: 'Right', val: 'right', on: () => { setPref('readingPaneVisible', true); setPref('readingPanePosition', 'right') } },
                { label: 'Bottom', val: 'bottom', on: () => { setPref('readingPaneVisible', true); setPref('readingPanePosition', 'bottom') } },
                { label: 'Left', val: 'left', on: () => { setPref('readingPaneVisible', true); setPref('readingPanePosition', 'left') } },
                { label: 'Hidden', val: 'hidden', on: set('readingPaneVisible', false) }
              ]}
            />
            <Segmented
              label="Sidebar"
              value={prefs.sidebarMode}
              options={[
                { label: 'Full', val: 'expanded', on: set('sidebarMode', 'expanded') },
                { label: 'Compact', val: 'compact', on: set('sidebarMode', 'compact') },
                { label: 'Icons', val: 'icons', on: set('sidebarMode', 'icons') },
                { label: 'Hidden', val: 'hidden', on: set('sidebarMode', 'hidden') }
              ]}
            />
            <Segmented
              label="Sidebar side"
              value={prefs.sidebarPosition}
              options={[
                { label: 'Left', val: 'left', on: set('sidebarPosition', 'left') },
                { label: 'Right', val: 'right', on: set('sidebarPosition', 'right') }
              ]}
            />
            <Segmented
              label="Density"
              value={prefs.messageListDensity}
              options={[
                { label: 'Comfortable', val: 'comfortable', on: set('messageListDensity', 'comfortable') },
                { label: 'Cozy', val: 'cozy', on: set('messageListDensity', 'cozy') },
                { label: 'Compact', val: 'compact', on: set('messageListDensity', 'compact') }
              ]}
            />
            <Segmented
              label="List style"
              value={prefs.messageListStyle}
              options={[
                { label: 'Avatars', val: 'avatars', on: set('messageListStyle', 'avatars') },
                { label: 'Plain', val: 'plain', on: set('messageListStyle', 'plain') }
              ]}
            />
            <Segmented
              label="Opening a message"
              value={prefs.openEmailBehaviour}
              options={[
                { label: 'Reading pane', val: 'reading-pane', on: set('openEmailBehaviour', 'reading-pane') },
                { label: 'Full window', val: 'full-window', on: set('openEmailBehaviour', 'full-window') }
              ]}
            />
            <Segmented
              label="Conversations"
              value={threading ? 'on' : 'off'}
              options={[
                { label: 'Grouped', val: 'on', on: () => setThreading(true) },
                { label: 'Off', val: 'off', on: () => setThreading(false) }
              ]}
            />
            <Segmented
              label="Mark as read"
              value={prefs.markReadBehaviour}
              options={[
                { label: 'On select', val: 'select', on: set('markReadBehaviour', 'select') },
                { label: 'After a delay', val: 'delay', on: set('markReadBehaviour', 'delay') },
                { label: 'Never', val: 'never', on: set('markReadBehaviour', 'never') }
              ]}
            />
            {prefs.markReadBehaviour === 'delay' && (
              <label className="flex items-center gap-2 pl-1 text-[12.5px] text-text-2">
                Mark read after
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={prefs.markReadDelaySeconds}
                  onChange={(e) => setPref('markReadDelaySeconds', Math.max(0, Number(e.target.value)))}
                  className="w-[64px] rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                />
                seconds
              </label>
            )}
            <div>
              <div className="mb-[7px] text-[12.5px] font-semibold">
                Preview lines · <span className="text-accent">{prefs.previewLineCount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={prefs.previewLineCount}
                onChange={(e) => setPref('previewLineCount', Number(e.target.value))}
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>
            <div>
              <div className="mb-[7px] text-[12.5px] font-semibold">
                Text size · <span className="text-accent">{Math.round(prefs.fontScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.1}
                value={prefs.fontScale}
                onChange={(e) => setPref('fontScale', Number(e.target.value))}
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-none justify-end border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
