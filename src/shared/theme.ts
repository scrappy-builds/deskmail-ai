// Custom colour themes — types, built-in palettes, and the pure helpers the
// renderer, main process and tests all share. A theme stores only the tokens
// the user changed; everything else inherits the built-in light/dark base, so
// future default-palette improvements flow into mostly-default themes.

export type ThemeBase = 'light' | 'dark'

// The editable tokens. Keys match the CSS var names (minus the leading --), so
// applying one is just setProperty('--' + key, value). The derived vars
// (--accent-soft, --claude-soft, --shadow) are not here on purpose: soft tints
// re-derive via color-mix(var(--accent)…) in styles.css, and shadows follow the
// base.
export const THEME_TOKEN_KEYS = [
  'bg', 'bg-2', 'bg-3', 'bg-inset', 'bg-hover',
  'border', 'border-2',
  'text', 'text-2', 'text-3',
  'accent', 'accent-2', 'accent-fg',
  'claude', 'star', 'green', 'red'
] as const

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number]
export type ThemeTokens = Partial<Record<ThemeTokenKey, string>>

export interface CustomTheme {
  version: 1
  id: string // stable unique id (randomUUID)
  name: string // user-facing label
  base: ThemeBase // built-in set that fills any token the user didn't touch
  tokens: ThemeTokens // only the overrides
}

// The built-in palettes, mirroring :root / [data-theme='dark'] in styles.css.
// Used to resolve a theme's full token set for the editor (initial picker
// values, swatch previews, contrast checks) without reading computed styles.
export const BUILTIN_TOKENS: Record<ThemeBase, Record<ThemeTokenKey, string>> = {
  light: {
    bg: '#f5f5f5', 'bg-2': '#ffffff', 'bg-3': '#efefef', 'bg-inset': '#eaeaea', 'bg-hover': '#f0f0f0',
    border: '#e4e4e4', 'border-2': '#d2d2d2',
    text: '#111111', 'text-2': '#4d4d4d', 'text-3': '#8a8a8a',
    accent: '#2f80ed', 'accent-2': '#1f66cc', 'accent-fg': '#ffffff',
    claude: '#bf8420', star: '#e0a72b', green: '#1a9e5e', red: '#dc2f42'
  },
  dark: {
    bg: '#111111', 'bg-2': '#181818', 'bg-3': '#202020', 'bg-inset': '#0b0b0b', 'bg-hover': '#252525',
    border: '#2a2a2a', 'border-2': '#393939',
    text: '#ffffff', 'text-2': '#cccccc', 'text-3': '#7d7d7d',
    accent: '#4a90e2', 'accent-2': '#5b9ff0', 'accent-fg': '#ffffff',
    claude: '#e0a13a', star: '#f2c14e', green: '#54d18a', red: '#f0787a'
  }
}

// Grouping metadata for the editor's swatch list.
export const THEME_TOKEN_GROUPS: Array<{ label: string; tokens: Array<{ key: ThemeTokenKey; label: string }> }> = [
  {
    label: 'Surfaces',
    tokens: [
      { key: 'bg', label: 'Background' },
      { key: 'bg-2', label: 'Panel' },
      { key: 'bg-3', label: 'Raised' },
      { key: 'bg-inset', label: 'Inset' },
      { key: 'bg-hover', label: 'Hover' }
    ]
  },
  {
    label: 'Borders',
    tokens: [
      { key: 'border', label: 'Border' },
      { key: 'border-2', label: 'Strong border' }
    ]
  },
  {
    label: 'Text',
    tokens: [
      { key: 'text', label: 'Primary' },
      { key: 'text-2', label: 'Secondary' },
      { key: 'text-3', label: 'Muted' }
    ]
  },
  {
    label: 'Accent',
    tokens: [
      { key: 'accent', label: 'Accent' },
      { key: 'accent-2', label: 'Accent hover' },
      { key: 'accent-fg', label: 'Accent text' }
    ]
  },
  {
    label: 'Status & marks',
    tokens: [
      { key: 'claude', label: 'Claude' },
      { key: 'star', label: 'Star' },
      { key: 'green', label: 'Success' },
      { key: 'red', label: 'Danger' }
    ]
  }
]

// Full token set for a theme: base palette with the overrides on top.
export function resolveTokens(theme: Pick<CustomTheme, 'base' | 'tokens'>): Record<ThemeTokenKey, string> {
  return { ...BUILTIN_TOKENS[theme.base], ...theme.tokens }
}

// A token value must look like a plain CSS colour — hex, rgb() or hsl(). This
// is a trust boundary for imported files: no semicolons, braces, var() or
// url() can sneak through into an inline style.
const COLOUR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[\d.,%\s/-]*\s*\))$/i

export function isValidColour(value: unknown): value is string {
  return typeof value === 'string' && COLOUR_RE.test(value.trim())
}

// Validate an untrusted imported object into a CustomTheme (fresh id, unknown
// token keys and malformed values silently dropped) or null if it isn't one.
export function validateImportedTheme(raw: unknown): CustomTheme | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.name !== 'string' || !o.name.trim()) return null
  if (o.base !== 'light' && o.base !== 'dark') return null
  if (typeof o.tokens !== 'object' || o.tokens === null) return null

  const tokens: ThemeTokens = {}
  for (const key of THEME_TOKEN_KEYS) {
    const v = (o.tokens as Record<string, unknown>)[key]
    if (isValidColour(v)) tokens[key] = v.trim()
  }
  return { version: 1, id: crypto.randomUUID(), name: o.name.trim().slice(0, 60), base: o.base, tokens }
}

// --- WCAG contrast (for the editor's low-contrast warning) --------------------
// Hex-only on purpose: the picker emits hex and the built-ins are hex. Returns
// null when either colour can't be parsed (e.g. an rgb() string) — callers
// treat null as "can't check", not as a failure.
function hexToRgb(value: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return null
  const la = luminance(ra)
  const lb = luminance(rb)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
