// Pure helpers shared by the command-bar action ribbon. Kept DOM-free so the
// selection→target and aggregate-state logic is unit-testable.

import type { MessageListItem } from '@shared/db'

// Which messages an action targets: the ticked set if any are ticked, otherwise
// the single message open in the reading pane, otherwise nothing.
export function effectiveTargets(selectedIds: Set<number>, selectedId: number | null): number[] {
  if (selectedIds.size > 0) return [...selectedIds]
  return selectedId != null ? [selectedId] : []
}

// Aggregate flag state across the target ids, so a toggle button can decide its
// direction/label (e.g. show "Read" while anything selected is still unread).
// Falls back to the open message's detail when a target isn't in the visible list.
export interface AggregateFlags {
  anyUnread: boolean
  anyUnflagged: boolean
  anyUnpinned: boolean
}

export function aggregateFlags(
  messages: MessageListItem[],
  ids: number[],
  fallback?: { isRead: boolean; isStarred: boolean; isPinned: boolean } | null
): AggregateFlags {
  const rows = ids
    .map((id) => messages.find((m) => m.id === id) ?? (fallback && ids.length === 1 ? { isRead: fallback.isRead, isStarred: fallback.isStarred, isPinned: fallback.isPinned } : null))
    .filter((r): r is { isRead: boolean; isStarred: boolean; isPinned: boolean } => r != null)
  return {
    anyUnread: rows.some((r) => !r.isRead),
    anyUnflagged: rows.some((r) => !r.isStarred),
    anyUnpinned: rows.some((r) => !r.isPinned)
  }
}
