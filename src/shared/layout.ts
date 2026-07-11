// The layout system — types, presets, and the pure arrangement function.
// Kept framework-free in /shared so the renderer and the tests share one source
// of truth. Values (widths, paddings) mirror design-files/DeskMail AI.dc.html.

import type { CustomTheme } from './theme'

export type Theme = 'light' | 'dark'
export type ReadingPanePosition = 'right' | 'bottom' | 'left' | 'hidden'
export type SidebarPosition = 'left' | 'right'
export type SidebarMode = 'expanded' | 'compact' | 'icons' | 'hidden'
export type MessageListDensity = 'comfortable' | 'cozy' | 'compact'
export type MessageListStyle = 'avatars' | 'plain' | 'table'
export type ClaudePanelPosition = 'right' | 'left' | 'float' | 'docked' | 'hidden'
export type OpenEmailBehaviour = 'reading-pane' | 'full-window'
export type MarkReadBehaviour = 'select' | 'delay' | 'never'
export type LayoutPreset =
  | 'classic'
  | 'bottom'
  | 'focus'
  | 'wide'
  | 'right'
  | 'noreading'
  | 'custom'

export interface LayoutPreferences {
  readingPanePosition: ReadingPanePosition
  readingPaneVisible: boolean
  sidebarPosition: SidebarPosition
  sidebarMode: SidebarMode
  messageListDensity: MessageListDensity
  messageListStyle: MessageListStyle
  previewLineCount: number // 0..3
  openEmailBehaviour: OpenEmailBehaviour
  markReadBehaviour: MarkReadBehaviour // when to auto-mark an opened message read
  markReadDelaySeconds: number // used when markReadBehaviour === 'delay'
  claudePanelPosition: ClaudePanelPosition
  selectedLayoutPreset: LayoutPreset
  theme: Theme
  fontScale: number // UI zoom / text-size, 0.8..1.4 (accessibility)
  customThemes: CustomTheme[] // user-made colour schemes (see shared/theme.ts)
  activeThemeId: string | null // null = built-in `theme`; else a CustomTheme.id
}

export const DEFAULT_LAYOUT: LayoutPreferences = {
  readingPanePosition: 'right',
  readingPaneVisible: true,
  sidebarPosition: 'left',
  sidebarMode: 'expanded',
  messageListDensity: 'cozy',
  messageListStyle: 'avatars',
  previewLineCount: 2,
  openEmailBehaviour: 'reading-pane',
  markReadBehaviour: 'select',
  markReadDelaySeconds: 2,
  claudePanelPosition: 'right',
  selectedLayoutPreset: 'classic',
  theme: 'light',
  fontScale: 1,
  customThemes: [],
  activeThemeId: null
}

// The six presets: each is a partial override of the current prefs. Fields not
// listed (density, previewLineCount, messageListStyle, theme, openEmailBehaviour)
// are intentionally preserved when switching preset.
type PresetPatch = Partial<
  Pick<
    LayoutPreferences,
    | 'sidebarMode'
    | 'sidebarPosition'
    | 'readingPaneVisible'
    | 'readingPanePosition'
    | 'claudePanelPosition'
  >
>

export const PRESETS: Record<Exclude<LayoutPreset, 'custom'>, PresetPatch> = {
  classic: { sidebarMode: 'expanded', sidebarPosition: 'left', readingPaneVisible: true, readingPanePosition: 'right', claudePanelPosition: 'right' },
  bottom: { sidebarMode: 'expanded', sidebarPosition: 'left', readingPaneVisible: true, readingPanePosition: 'bottom', claudePanelPosition: 'right' },
  focus: { sidebarMode: 'icons', sidebarPosition: 'left', readingPaneVisible: true, readingPanePosition: 'right', claudePanelPosition: 'float' },
  wide: { sidebarMode: 'expanded', sidebarPosition: 'left', readingPaneVisible: true, readingPanePosition: 'right', claudePanelPosition: 'docked' },
  right: { sidebarMode: 'expanded', sidebarPosition: 'right', readingPaneVisible: true, readingPanePosition: 'right', claudePanelPosition: 'right' },
  noreading: { sidebarMode: 'expanded', sidebarPosition: 'left', readingPaneVisible: false, readingPanePosition: 'hidden', claudePanelPosition: 'right' }
}

export const PRESET_LABELS: Record<LayoutPreset, string> = {
  classic: 'Classic',
  bottom: 'Bottom Preview',
  focus: 'Focus Mode',
  wide: 'Wide Monitor',
  right: 'Right Sidebar',
  noreading: 'No Reading Pane',
  custom: 'Custom Layout'
}

export function applyPreset(prefs: LayoutPreferences, preset: Exclude<LayoutPreset, 'custom'>): LayoutPreferences {
  return { ...prefs, ...PRESETS[preset], selectedLayoutPreset: preset }
}

// Changing any single field puts us in 'custom' unless it still matches a preset.
export function setPref<K extends keyof LayoutPreferences>(
  prefs: LayoutPreferences,
  key: K,
  value: LayoutPreferences[K]
): LayoutPreferences {
  const next = { ...prefs, [key]: value }
  // theme is orthogonal to the layout preset — don't flip to 'custom' for it.
  if (key !== 'theme' && key !== 'selectedLayoutPreset') next.selectedLayoutPreset = matchPreset(next)
  return next
}

// If the current prefs exactly match a preset's fields, report that preset.
export function matchPreset(prefs: LayoutPreferences): LayoutPreset {
  for (const name of Object.keys(PRESETS) as Array<Exclude<LayoutPreset, 'custom'>>) {
    const patch = PRESETS[name]
    const matches = (Object.keys(patch) as Array<keyof PresetPatch>).every((k) => prefs[k] === patch[k])
    if (matches) return name
  }
  return 'custom'
}

// --- Arrangement ---------------------------------------------------------------
// Pure description of how the regions lay out. The renderer turns this into
// flex styles; tests assert against it directly.

export type ClaudeMode = 'docked' | 'slide-right' | 'slide-left' | 'float' | 'hidden'

export interface Arrangement {
  sidebar: { visible: boolean; width: number; showLabels: boolean; order: number; side: SidebarPosition }
  main: { direction: 'row' | 'column' }
  list: { order: number; grow: boolean; basisPx: number | null }
  reading: { visible: boolean; position: ReadingPanePosition; order: number; bottom: boolean }
  claude: ClaudeMode
  rowPaddingY: number
  previewLineCount: number
  showSnippet: boolean
}

const SIDEBAR_WIDTH: Record<SidebarMode, number> = { hidden: 0, icons: 64, compact: 204, expanded: 252 }
const DENSITY_PADDING: Record<MessageListDensity, number> = { comfortable: 14, cozy: 11, compact: 8 }

export function computeArrangement(p: LayoutPreferences): Arrangement {
  const sidebarVisible = p.sidebarMode !== 'hidden'
  const rp: ReadingPanePosition = p.readingPaneVisible ? p.readingPanePosition : 'hidden'

  let list: Arrangement['list']
  let reading: Arrangement['reading']
  if (rp === 'hidden') {
    list = { order: 0, grow: true, basisPx: null }
    reading = { visible: false, position: 'hidden', order: 1, bottom: false }
  } else if (rp === 'bottom') {
    list = { order: 0, grow: true, basisPx: null }
    reading = { visible: true, position: 'bottom', order: 1, bottom: true }
  } else {
    // right | left
    const listW = p.sidebarMode === 'icons' ? 320 : 376
    list = { order: rp === 'left' ? 1 : 0, grow: false, basisPx: listW }
    reading = { visible: true, position: rp, order: rp === 'left' ? 0 : 1, bottom: false }
  }

  let claude: ClaudeMode
  switch (p.claudePanelPosition) {
    case 'docked': claude = 'docked'; break
    case 'left': claude = 'slide-left'; break
    case 'float': claude = 'float'; break
    case 'hidden': claude = 'hidden'; break
    default: claude = 'slide-right'
  }

  return {
    sidebar: {
      visible: sidebarVisible,
      width: SIDEBAR_WIDTH[p.sidebarMode],
      showLabels: p.sidebarMode !== 'icons' && p.sidebarMode !== 'hidden',
      order: p.sidebarPosition === 'right' ? 3 : 0,
      side: p.sidebarPosition
    },
    main: { direction: rp === 'bottom' ? 'column' : 'row' },
    list,
    reading,
    claude,
    rowPaddingY: DENSITY_PADDING[p.messageListDensity],
    previewLineCount: p.previewLineCount,
    showSnippet: p.previewLineCount > 0
  }
}
