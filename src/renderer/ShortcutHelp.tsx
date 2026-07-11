import { Icon } from './Icon'
import { SHORTCUTS, type Keymap } from '@shared/shortcuts'

// The '?' cheat-sheet. Renders from the live keymap so it always shows the
// user's actual bindings, not the defaults. Cleared actions show a dash.
export function ShortcutHelp({ map, onClose }: { map: Keymap; onClose: () => void }): JSX.Element {
  return (
    <div
      className="absolute inset-0 z-[63] flex items-center justify-center"
      style={{ background: 'rgba(5,6,10,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
      data-testid="shortcut-help"
    >
      <div
        className="flex max-h-[80vh] w-[min(440px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center border-b border-border px-5 py-4">
          <span className="text-[16px] font-bold">Keyboard shortcuts</span>
          <div className="flex-1" />
          <button onClick={onClose} className="flex rounded-md p-2 text-text-2 hover:bg-raised" aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-1.5">
            {SHORTCUTS.map((s) => (
              <div key={s.action} className="flex items-center gap-3 py-1">
                <span className="min-w-0 flex-1 text-[13px] text-text-2">{s.label}</span>
                <kbd className="flex-none rounded-md border border-border bg-bg px-2 py-1 font-mono text-[12px] font-semibold text-text">
                  {map[s.action] === 'Enter' ? '↵ Enter' : map[s.action] || '—'}
                </kbd>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-text-3">
            Remap or turn these off in Settings → Shortcuts. Tip: press <span className="font-mono">Win</span> +
            <span className="font-mono"> .</span> for the Windows emoji picker in any text box.
          </p>
        </div>
      </div>
    </div>
  )
}
