import { describe, expect, it } from 'vitest'
import { offsetOf, visibleRange } from '../../src/renderer/regions/useWindowedList'

describe('list windowing maths', () => {
  it('uniform rows: renders the viewport slice plus overscan', () => {
    const heights = Array(1000).fill(50)
    const r = visibleRange(heights, 5000, 500, 6)
    // Rows 100–110 are on screen; overscan pads both sides.
    expect(r.start).toBe(94)
    expect(r.end).toBe(116)
    expect(r.topPad).toBe(94 * 50)
    expect(r.total).toBe(50000)
    expect(r.bottomPad).toBe(50000 - 116 * 50)
  })

  it('mixed header/row heights keep offsets exact', () => {
    // header(25) + 3 rows(60) + header(25) + 3 rows(60)
    const heights = [25, 60, 60, 60, 25, 60, 60, 60]
    const r = visibleRange(heights, 200, 100, 0)
    // 200px in: past header(25)+2 rows(145 total 205>200 → row index 3 starts at 145)
    expect(r.start).toBe(3)
    expect(r.topPad).toBe(25 + 60 + 60)
    // window covers up to 300px: entries at 145..205 (idx3), 205..230 (idx4), 230..290 (idx5), 290..350 (idx6)
    expect(r.end).toBe(7)
  })

  it('clamps at the edges', () => {
    const heights = Array(10).fill(40)
    const top = visibleRange(heights, 0, 100, 3)
    expect(top.start).toBe(0)
    expect(top.topPad).toBe(0)
    const bottom = visibleRange(heights, 99999, 100, 3)
    expect(bottom.end).toBe(10)
    expect(bottom.bottomPad).toBe(0)
  })

  it('empty list renders nothing', () => {
    const r = visibleRange([], 0, 500)
    expect(r).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0, total: 0 })
  })

  it('a huge folder renders only a few dozen rows', () => {
    const heights = Array(20000).fill(48)
    const r = visibleRange(heights, 480000, 800, 6)
    expect(r.end - r.start).toBeLessThan(50)
    expect(r.total).toBe(20000 * 48)
  })

  it('offsetOf sums heights before the index', () => {
    expect(offsetOf([25, 60, 60], 0)).toBe(0)
    expect(offsetOf([25, 60, 60], 2)).toBe(85)
    expect(offsetOf([25, 60, 60], 99)).toBe(145)
  })
})
