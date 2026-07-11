import { useEffect, useState } from 'react'
import {
  BUILTIN_TOKENS,
  THEME_TOKEN_GROUPS,
  contrastRatio,
  isValidColour,
  resolveTokens,
  type CustomTheme,
  type ThemeBase,
  type ThemeTokenKey
} from '@shared/theme'
import { Icon } from '../Icon'
import { useLayout } from '../store/layoutStore'
import { useToast } from '../store/toastStore'
import { applyTheme } from '../theme'

const inputCls = 'rounded-md border border-border bg-bg px-3 py-2 text-[13.5px] text-text outline-none focus:border-accent'

// The native colour input needs #rrggbb; expand #rgb, reject anything else.
function toHex6(value: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const h = m[1]
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h)
}

function newTheme(base: ThemeBase): CustomTheme {
  return { version: 1, id: crypto.randomUUID(), name: 'My theme', base, tokens: {} }
}

// Small horizontal strip of a theme's key colours, used on the picker cards.
function SwatchStrip({ theme }: { theme: Pick<CustomTheme, 'base' | 'tokens'> }): JSX.Element {
  const t = resolveTokens(theme)
  const keys: ThemeTokenKey[] = ['bg', 'bg-2', 'text', 'accent', 'claude', 'star']
  return (
    <span className="flex overflow-hidden rounded-sm border border-border">
      {keys.map((k) => (
        <span key={k} className="h-4 w-4" style={{ background: t[k] }} />
      ))}
    </span>
  )
}

// Colour picker + free-text field for one token. Text commits only when it
// parses as a colour, so half-typed hex never lands in the theme.
function ColourInputs({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        value={toHex6(value) ?? '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 flex-none cursor-pointer rounded border border-border bg-bg p-0.5"
      />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (isValidColour(e.target.value)) onChange(e.target.value.trim())
        }}
        spellCheck={false}
        className="w-[92px] rounded-md border border-border bg-bg px-2 py-1 font-mono text-[12px] text-text outline-none focus:border-accent"
      />
    </span>
  )
}

// --- The editor itself ---------------------------------------------------------
function ThemeEditor({ initial, onSave, onCancel }: { initial: CustomTheme; onSave: (t: CustomTheme) => void; onCancel: () => void }): JSX.Element {
  const [draft, setDraft] = useState<CustomTheme>(initial)
  const [selected, setSelected] = useState<ThemeTokenKey>('bg')
  const resolved = resolveTokens(draft)

  // Live preview: the whole app wears the draft while editing; whatever theme
  // is actually saved comes back on unmount (Save and Cancel both unmount).
  useEffect(() => {
    applyTheme({ theme: draft.base, customThemes: [draft], activeThemeId: draft.id })
  }, [draft])
  useEffect(() => () => applyTheme(useLayout.getState().prefs), [])

  const setToken = (key: ThemeTokenKey, value: string): void => {
    setDraft((d) => {
      const tokens = { ...d.tokens }
      // Setting a token back to its base value clears the override.
      if (value === BUILTIN_TOKENS[d.base][key]) delete tokens[key]
      else tokens[key] = value
      return { ...d, tokens }
    })
  }
  const clearToken = (key: ThemeTokenKey): void =>
    setDraft((d) => {
      const tokens = { ...d.tokens }
      delete tokens[key]
      return { ...d, tokens }
    })

  // Accessibility guard: warn when core text-on-surface pairs get hard to read.
  const contrastPairs: Array<[string, ThemeTokenKey, ThemeTokenKey]> = [
    ['Text on background', 'text', 'bg'],
    ['Text on panels', 'text', 'bg-2'],
    ['Secondary text on panels', 'text-2', 'bg-2'],
    ['Accent button text', 'accent-fg', 'accent']
  ]
  const warnings = contrastPairs.filter(([, fg, bg]) => {
    const r = contrastRatio(resolved[fg], resolved[bg])
    return r !== null && r < 4.5
  })

  // A clickable region of the mini preview: click selects that token's swatch.
  const region = (token: ThemeTokenKey, cls: string, style: React.CSSProperties, children?: React.ReactNode): JSX.Element => (
    <div
      onClick={(e) => {
        e.stopPropagation()
        setSelected(token)
      }}
      className={`cursor-pointer ${cls}`}
      style={selected === token ? { ...style, outline: '2px solid ' + resolved.accent, outlineOffset: '-2px' } : style}
      title={`Edit: ${token}`}
    >
      {children}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Theme name" className={`${inputCls} w-[220px]`} aria-label="Theme name" />
        <span className="text-[12.5px] text-text-2">Based on</span>
        {(['light', 'dark'] as ThemeBase[]).map((b) => (
          <label key={b} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-2">
            <input type="radio" name="theme-base" checked={draft.base === b} onChange={() => setDraft((d) => ({ ...d, base: b }))} className="accent-accent" />
            {b === 'light' ? 'Light' : 'Dark'}
          </label>
        ))}
      </div>
      <p className="text-[12.5px] leading-relaxed text-text-3">
        The whole app repaints live as you pick colours. Click a part of the mini preview (or any
        swatch below) to change it. Colours you haven't touched follow the built-in {draft.base} theme.
      </p>

      {/* Mini preview — a shrunken mock of the app; regions select their token. */}
      {region('bg', 'flex gap-1.5 rounded-lg border p-2', { background: resolved.bg, borderColor: resolved.border, height: 132 }, (
        <>
          {region('bg-2', 'flex w-[26%] flex-col gap-1.5 rounded-md border p-2', { background: resolved['bg-2'], borderColor: resolved.border }, (
            <>
              {region('accent', 'rounded px-1.5 py-1 text-center text-[9px] font-bold', { background: resolved.accent, color: resolved['accent-fg'] }, 'Compose')}
              {region('text-2', 'h-1.5 w-4/5 rounded-sm', { background: resolved['text-2'] })}
              {region('text-3', 'h-1.5 w-3/5 rounded-sm', { background: resolved['text-3'] })}
              {region('text-3', 'h-1.5 w-2/3 rounded-sm', { background: resolved['text-3'] })}
            </>
          ))}
          {region('bg-2', 'flex w-[34%] flex-col gap-1.5 rounded-md border p-2', { background: resolved['bg-2'], borderColor: resolved.border }, (
            <>
              {region('bg-hover', 'flex flex-col gap-1 rounded p-1.5', { background: resolved['bg-hover'] }, (
                <>
                  {region('text', 'h-1.5 w-4/5 rounded-sm', { background: resolved.text })}
                  {region('text-3', 'h-1 w-3/5 rounded-sm', { background: resolved['text-3'] })}
                </>
              ))}
              {region('star', 'flex items-center gap-1 rounded p-1.5', { background: 'transparent' }, (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ background: resolved.star }} />
                  {region('text-2', 'h-1.5 w-3/5 rounded-sm', { background: resolved['text-2'] })}
                </>
              ))}
              {region('claude', 'flex items-center gap-1 rounded p-1.5', { background: 'transparent' }, (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ background: resolved.claude }} />
                  {region('text-2', 'h-1.5 w-1/2 rounded-sm', { background: resolved['text-2'] })}
                </>
              ))}
            </>
          ))}
          {region('bg-3', 'flex flex-1 flex-col gap-1.5 rounded-md border p-2', { background: resolved['bg-3'], borderColor: resolved['border-2'] }, (
            <>
              {region('text', 'h-2 w-2/3 rounded-sm', { background: resolved.text })}
              {region('border', 'h-px w-full', { background: resolved.border })}
              {region('text-2', 'h-1.5 w-11/12 rounded-sm', { background: resolved['text-2'] })}
              {region('text-2', 'h-1.5 w-4/5 rounded-sm', { background: resolved['text-2'] })}
              {region('green', 'mt-auto h-1.5 w-1/4 rounded-sm', { background: resolved.green })}
            </>
          ))}
        </>
      ))}

      {warnings.length > 0 && (
        <div className="rounded-md px-3.5 py-2.5 text-[12.5px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}>
          ⚠ Low contrast — hard to read: {warnings.map(([label]) => label).join(', ')}. Aim for at
          least 4.5:1 between text and its background.
        </div>
      )}

      {/* Grouped swatches */}
      <div className="flex flex-col gap-3.5">
        {THEME_TOKEN_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.6px] text-text-3">{group.label}</div>
            <div className="flex flex-col gap-1">
              {group.tokens.map(({ key, label }) => {
                const overridden = key in draft.tokens
                return (
                  <div
                    key={key}
                    onClick={() => setSelected(key)}
                    className="flex items-center gap-3 rounded-md border px-3 py-1.5"
                    style={{ borderColor: selected === key ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <span className="w-[130px] flex-none text-[13px] font-semibold">{label}</span>
                    <ColourInputs value={resolved[key]} onChange={(v) => setToken(key, v)} />
                    <span className="flex-1" />
                    {overridden ? (
                      <button onClick={() => clearToken(key)} className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-text-2 hover:underline" title="Back to the base colour">
                        Reset
                      </button>
                    ) : (
                      <span className="px-2 text-[11.5px] text-text-3">base</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <button onClick={() => onSave({ ...draft, name: draft.name.trim() || 'My theme' })} className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          Save theme
        </button>
        <button onClick={onCancel} className="rounded-md px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">Cancel</button>
        <span className="flex-1" />
        <button onClick={() => setDraft((d) => ({ ...d, tokens: {} }))} className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:underline">
          Reset all colours
        </button>
      </div>
    </div>
  )
}

// --- The Appearance pane: scheme cards + create/edit/import/export --------------
export function AppearancePane(): JSX.Element {
  const prefs = useLayout((s) => s.prefs)
  const setPref = useLayout((s) => s.setPref)
  const showToast = useToast((s) => s.show)
  const [editing, setEditing] = useState<CustomTheme | null>(null)

  if (editing) {
    return (
      <ThemeEditor
        initial={editing}
        onSave={(theme) => {
          const others = prefs.customThemes.filter((t) => t.id !== theme.id)
          setPref('customThemes', [...others, theme])
          setPref('activeThemeId', theme.id)
          setEditing(null)
          showToast({ text: 'Theme saved' })
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const useBuiltin = (base: ThemeBase): void => {
    setPref('activeThemeId', null)
    setPref('theme', base)
  }
  const remove = (t: CustomTheme): void => {
    if (!confirm(`Delete the theme “${t.name}”?`)) return
    setPref('customThemes', prefs.customThemes.filter((x) => x.id !== t.id))
    if (prefs.activeThemeId === t.id) setPref('activeThemeId', null)
  }
  const duplicate = (t: CustomTheme): void => {
    setPref('customThemes', [...prefs.customThemes, { ...t, id: crypto.randomUUID(), name: `${t.name} copy` }])
  }
  const importTheme = async (): Promise<void> => {
    const r = await window.deskmail.theme.import()
    if (r.theme) {
      setPref('customThemes', [...prefs.customThemes, r.theme])
      showToast({ text: `Imported “${r.theme.name}”` })
    } else if (r.error) showToast({ text: r.error })
  }

  const card = (active: boolean, onPick: () => void, label: React.ReactNode, strip: JSX.Element, actions?: React.ReactNode): JSX.Element => (
    <div
      className="flex items-center gap-3 rounded-md border bg-bg px-3.5 py-2.5"
      style={{ borderColor: active ? 'var(--accent)' : 'var(--border)' }}
    >
      <button onClick={onPick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {strip}
        <span className="truncate text-[13px] font-semibold">{label}</span>
        {active && <Icon name="check" size={14} className="flex-none text-accent" />}
      </button>
      {actions}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-text-2">
        Pick a colour scheme, or make your own — every part of the app follows it, and your schemes
        are saved with your settings, so they survive updates and ride along in backups.
      </p>

      <div className="flex flex-col gap-1.5">
        {card(prefs.activeThemeId === null && prefs.theme === 'light', () => useBuiltin('light'), 'Light', <SwatchStrip theme={{ base: 'light', tokens: {} }} />)}
        {card(prefs.activeThemeId === null && prefs.theme === 'dark', () => useBuiltin('dark'), 'Dark', <SwatchStrip theme={{ base: 'dark', tokens: {} }} />)}
        {prefs.customThemes.map((t) =>
          card(
            prefs.activeThemeId === t.id,
            () => setPref('activeThemeId', t.id),
            t.name,
            <SwatchStrip theme={t} />,
            <span className="flex flex-none items-center gap-1">
              <button onClick={() => setEditing(t)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:underline">Edit</button>
              <button onClick={() => duplicate(t)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:underline">Duplicate</button>
              <button onClick={() => void window.deskmail.theme.export(t).then((r) => r.path && showToast({ text: 'Theme exported' }))} className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:underline">Export</button>
              <button onClick={() => remove(t)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-danger hover:underline">Delete</button>
            </span>
          )
        )}
      </div>

      <div className="flex gap-2.5">
        <button onClick={() => setEditing(newTheme(prefs.theme))} className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-2">
          <Icon name="plus" size={15} /> New theme
        </button>
        <button onClick={() => void importTheme()} className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-raised">
          Import theme
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-text-3">
        A new theme starts as a copy of the current {prefs.theme} colours. Export saves a scheme as a
        small <span className="font-mono">.deskmailtheme</span> file you can share or re-import.
      </p>
    </div>
  )
}
