// Bulk actions over a set of selected message ids. Pure planner + a runner, kept
// separate so the mapping (which op → which IPC call per id) is unit-testable
// without a DOM. ponytail: client-side loop; fine for a folder's worth of mail.

export type BulkOp = 'read' | 'unread' | 'delete' | 'move'

export interface BulkStep {
  id: number
  op: BulkOp
  targetFolderId?: number
}

export function planBulk(op: BulkOp, ids: Iterable<number>, targetFolderId?: number): BulkStep[] {
  return [...ids].map((id) => ({ id, op, targetFolderId }))
}

// Executes each planned step against the mail IPC bridge.
export async function runBulk(steps: BulkStep[]): Promise<void> {
  for (const s of steps) {
    if (s.op === 'read') await window.deskmail.mail.markRead(s.id, true)
    else if (s.op === 'unread') await window.deskmail.mail.markRead(s.id, false)
    else if (s.op === 'delete') await window.deskmail.mail.action(s.id, 'trash')
    else if (s.op === 'move' && s.targetFolderId != null) await window.deskmail.mail.action(s.id, 'move', s.targetFolderId)
  }
}
