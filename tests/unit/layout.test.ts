import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYOUT,
  PRESETS,
  applyPreset,
  computeArrangement,
  matchPreset,
  setPref,
  type LayoutPreset
} from '../../src/shared/layout'

const ALL_PRESETS = Object.keys(PRESETS) as Array<Exclude<LayoutPreset, 'custom'>>

describe('presets', () => {
  it('applyPreset sets the selected preset and its fields', () => {
    for (const name of ALL_PRESETS) {
      const prefs = applyPreset(DEFAULT_LAYOUT, name)
      expect(prefs.selectedLayoutPreset).toBe(name)
      for (const [k, v] of Object.entries(PRESETS[name])) {
        expect(prefs[k as keyof typeof prefs]).toBe(v)
      }
    }
  })

  it('each preset produces the expected arrangement', () => {
    // Classic — sidebar left, list left of a right reading pane.
    const classic = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'classic'))
    expect(classic.sidebar.side).toBe('left')
    expect(classic.sidebar.visible).toBe(true)
    expect(classic.reading).toMatchObject({ visible: true, position: 'right', order: 1 })
    expect(classic.list.order).toBe(0)
    expect(classic.main.direction).toBe('row')
    expect(classic.claude).toBe('slide-right')

    // Bottom Preview — list stacked above reading, column main.
    const bottom = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'bottom'))
    expect(bottom.main.direction).toBe('column')
    expect(bottom.reading).toMatchObject({ visible: true, position: 'bottom', bottom: true })

    // Focus Mode — icons-only sidebar, floating Claude.
    const focus = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'focus'))
    expect(focus.sidebar.width).toBe(64)
    expect(focus.sidebar.showLabels).toBe(false)
    expect(focus.claude).toBe('float')

    // Wide Monitor — Claude docked.
    const wide = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'wide'))
    expect(wide.claude).toBe('docked')

    // Right Sidebar — sidebar on the right (order 3).
    const right = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'right'))
    expect(right.sidebar.side).toBe('right')
    expect(right.sidebar.order).toBe(3)

    // No Reading Pane — reading hidden, list grows.
    const noreading = computeArrangement(applyPreset(DEFAULT_LAYOUT, 'noreading'))
    expect(noreading.reading.visible).toBe(false)
    expect(noreading.list.grow).toBe(true)
  })

  it('left reading pane flips list/reading order', () => {
    const p = setPref(DEFAULT_LAYOUT, 'readingPanePosition', 'left')
    const a = computeArrangement(p)
    expect(a.reading.order).toBe(0)
    expect(a.list.order).toBe(1)
  })
})

describe('matchPreset / setPref', () => {
  it('default prefs match the classic preset', () => {
    expect(matchPreset(DEFAULT_LAYOUT)).toBe('classic')
  })

  it('changing a layout field drops to custom, reverting restores the preset', () => {
    const custom = setPref(DEFAULT_LAYOUT, 'sidebarMode', 'hidden')
    expect(custom.selectedLayoutPreset).toBe('custom')
    const back = setPref(custom, 'sidebarMode', 'expanded')
    expect(back.selectedLayoutPreset).toBe('classic')
  })

  it('changing theme does not affect the selected preset', () => {
    const themed = setPref(DEFAULT_LAYOUT, 'theme', 'dark')
    expect(themed.selectedLayoutPreset).toBe('classic')
    expect(themed.theme).toBe('dark')
  })

  it('density affects row padding; preview lines toggle the snippet', () => {
    expect(computeArrangement(setPref(DEFAULT_LAYOUT, 'messageListDensity', 'compact')).rowPaddingY).toBe(8)
    expect(computeArrangement(setPref(DEFAULT_LAYOUT, 'messageListDensity', 'comfortable')).rowPaddingY).toBe(14)
    expect(computeArrangement(setPref(DEFAULT_LAYOUT, 'previewLineCount', 0)).showSnippet).toBe(false)
  })
})
