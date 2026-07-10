// Hand-rolled list windowing (no dependency): given per-item heights and the
// scroll position, which slice needs real DOM? Everything above/below renders
// as empty spacer padding, so a 20,000-row folder scrolls like 50.

export interface WindowRange {
  start: number // first index to render (inclusive)
  end: number // one past the last index to render
  topPad: number // spacer height above the rendered slice
  bottomPad: number // spacer height below it
  total: number // full content height
}

export function visibleRange(heights: number[], scrollTop: number, viewportHeight: number, overscan = 6): WindowRange {
  const n = heights.length
  const prefix = new Array<number>(n + 1)
  prefix[0] = 0
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + heights[i]
  const total = prefix[n]

  const top = Math.max(0, Math.min(scrollTop, total))
  let start = 0
  while (start < n && prefix[start + 1] <= top) start++
  let end = start
  while (end < n && prefix[end] < top + Math.max(0, viewportHeight)) end++

  start = Math.max(0, start - overscan)
  end = Math.min(n, end + overscan)
  return { start, end, topPad: prefix[start], bottomPad: total - prefix[end], total }
}

// Offset of one item from the top (scroll-selected-row-into-view helper).
export function offsetOf(heights: number[], index: number): number {
  let sum = 0
  for (let i = 0; i < Math.min(index, heights.length); i++) sum += heights[i]
  return sum
}
