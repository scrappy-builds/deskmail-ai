import { describe, expect, it } from 'vitest'
import { planBulk } from '../../src/renderer/mail/bulkOps'

describe('planBulk', () => {
  it('maps each id to a delete step', () => {
    const steps = planBulk('delete', [1, 2, 3])
    expect(steps).toEqual([
      { id: 1, op: 'delete', targetFolderId: undefined },
      { id: 2, op: 'delete', targetFolderId: undefined },
      { id: 3, op: 'delete', targetFolderId: undefined }
    ])
  })

  it('carries the target folder for a move', () => {
    const steps = planBulk('move', new Set([7]), 42)
    expect(steps).toEqual([{ id: 7, op: 'move', targetFolderId: 42 }])
  })

  it('handles an empty selection', () => {
    expect(planBulk('read', [])).toEqual([])
  })
})
