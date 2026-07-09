import { DEFAULT_LAYOUT, type LayoutPreferences } from '@shared/layout'
import type { DB } from './database'

// Maps the single-row layout_preferences table <-> the LayoutPreferences shape.

interface LayoutRow {
  reading_pane_position: string
  reading_pane_visible: number
  sidebar_position: string
  sidebar_mode: string
  message_list_density: string
  message_list_style: string
  preview_line_count: number
  open_email_behaviour: string
  claude_panel_position: string
  selected_layout_preset: string
  theme: string
  font_scale: number | null
}

function rowToPrefs(r: LayoutRow): LayoutPreferences {
  return {
    readingPanePosition: r.reading_pane_position as LayoutPreferences['readingPanePosition'],
    readingPaneVisible: !!r.reading_pane_visible,
    sidebarPosition: r.sidebar_position as LayoutPreferences['sidebarPosition'],
    sidebarMode: r.sidebar_mode as LayoutPreferences['sidebarMode'],
    messageListDensity: r.message_list_density as LayoutPreferences['messageListDensity'],
    messageListStyle: r.message_list_style as LayoutPreferences['messageListStyle'],
    previewLineCount: r.preview_line_count,
    openEmailBehaviour: r.open_email_behaviour as LayoutPreferences['openEmailBehaviour'],
    claudePanelPosition: r.claude_panel_position as LayoutPreferences['claudePanelPosition'],
    selectedLayoutPreset: r.selected_layout_preset as LayoutPreferences['selectedLayoutPreset'],
    theme: r.theme as LayoutPreferences['theme'],
    fontScale: r.font_scale ?? 1
  }
}

export function loadLayoutPrefs(db: DB): LayoutPreferences {
  const row = db.get('SELECT * FROM layout_preferences WHERE id = 1') as unknown as LayoutRow | undefined
  return row ? { ...DEFAULT_LAYOUT, ...rowToPrefs(row) } : { ...DEFAULT_LAYOUT }
}

export function saveLayoutPrefs(db: DB, p: LayoutPreferences): void {
  db.run(
    `INSERT INTO layout_preferences (
       id, reading_pane_position, reading_pane_visible, sidebar_position, sidebar_mode,
       message_list_density, message_list_style, preview_line_count, open_email_behaviour,
       claude_panel_position, selected_layout_preset, theme, font_scale, updated_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       reading_pane_position = excluded.reading_pane_position,
       reading_pane_visible  = excluded.reading_pane_visible,
       sidebar_position      = excluded.sidebar_position,
       sidebar_mode          = excluded.sidebar_mode,
       message_list_density  = excluded.message_list_density,
       message_list_style    = excluded.message_list_style,
       preview_line_count    = excluded.preview_line_count,
       open_email_behaviour  = excluded.open_email_behaviour,
       claude_panel_position = excluded.claude_panel_position,
       selected_layout_preset = excluded.selected_layout_preset,
       theme                 = excluded.theme,
       font_scale            = excluded.font_scale,
       updated_at            = datetime('now')`,
    [
      p.readingPanePosition,
      p.readingPaneVisible ? 1 : 0,
      p.sidebarPosition,
      p.sidebarMode,
      p.messageListDensity,
      p.messageListStyle,
      p.previewLineCount,
      p.openEmailBehaviour,
      p.claudePanelPosition,
      p.selectedLayoutPreset,
      p.theme,
      p.fontScale
    ]
  )
}

// One-time import of the Stage 1–3 settings.json into the DB, run only when the
// layout_preferences row doesn't exist yet.
export function seedLayoutIfEmpty(db: DB, legacy: LayoutPreferences | null): void {
  const exists = db.get('SELECT 1 FROM layout_preferences WHERE id = 1')
  if (!exists) saveLayoutPrefs(db, legacy ?? DEFAULT_LAYOUT)
}

// Global key/value app settings (undo delay, junk filter, meeting provider, …).
export function getAppSetting(db: DB, key: string): string | null {
  const row = db.get('SELECT value FROM app_settings WHERE key = ?', [key]) as { value: string | null } | undefined
  return row?.value ?? null
}

export function setAppSetting(db: DB, key: string, value: string): void {
  db.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}
