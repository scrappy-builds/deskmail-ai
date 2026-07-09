# DeskMail AI — Folder structure & message-handling fixes

Date: 2026-07-09

A batch of sidebar / message-view fixes and two new features (subfolders + drag,
multi-select bulk actions). Decisions confirmed with Jamie:

- Title-bar **View** menu items get wired up (not removed).
- Email bodies **stay on a white card** in dark mode (dark-mode remap dropped).
- Subfolders and re-ordering are **local to DeskMail only** — no IMAP nesting.

---

## 1. Junk gets a shield icon

**Problem:** Junk and Trash share the `trash` icon in the sidebar.

- `Icon.tsx`: add a `shield` path (`M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z`), add `'shield'` to `IconName`.
- `Sidebar.tsx` `folderIcon()`: `junk`/`spam` → `'shield'` (currently `'trash'`).

*Check:* none needed (static mapping) — verified visually.

## 2. Wire up the title-bar View menu

**Problem:** `View → View settings…`, `Mail`, `Calendar` are dead placeholders.

- `App.tsx`: pass `onOpenViewSettings` and `onMode` down to `TitleBar`.
- `TitleBar.tsx`: give the three items `onClick`s (`View settings…` → open panel;
  `Mail`/`Calendar` → `onMode(...)`). Leave genuinely-unbuilt items (Help) alone.

*Check:* none (wiring).

## 3. Dark-mode email body — no change

Dropped per decision. `EmailBody`'s white-card comment stays.

## 4 + 8. Auto-load images (except Junk) and keep them loaded

**Problem:** remote images are blocked by default and the "Load images" choice is
throwaway React state — it resets on every re-render (e.g. switching folders and
back), so images have to be re-loaded.

- `EmailBody` gains an `allowByDefault: boolean` prop. Initial `allowImages` =
  `allowByDefault`.
- Auto-load everywhere **except Junk**: caller passes `allowByDefault={!junk}`.
  - `ReadingPane`: already computes `inJunk` → pass `!inJunk`.
  - `MessageWindow`: needs the message's folder role. Add `folderRole` to
    `MessageDetail` (join in `getMessage`); junk = `folderRole === 'junk'`.
- Persist manual loads across re-renders with a module-level `Set<number>` of
  message ids in `EmailBody.tsx`. Clicking "Load images" adds the id; initial
  state also checks the set. This fixes the folder-switch reset without a schema
  change.
  - `ponytail:` in-memory set, resets on app restart. A junk message re-blocks
    after restart, which is the safe default; add a DB column only if Jamie wants
    it to persist across restarts.

*Check:* a small unit assert that `initialAllow(junk, remembered)` returns the
right boolean for the four cases.

## 5. Mark unread ↔ Mark read toggle

**Problem:** the action is always "Mark unread" even when the message is already
unread; it should flip to "Mark read".

- `ReadingPane`: the `markUnread` `ToolBtn` becomes conditional on `m.isRead` —
  read → "Mark unread" (`markRead(id,false)`); unread → "Mark read"
  (`markRead(id,true)`). Refresh the store after.
- `MessageWindow`: replace the static `Mark unread` entry in `ACTIONS` with a
  dynamic button driven by `m.isRead`; on click call `markRead`, then update local
  `m` via `setM` so the label flips without closing the window.

Note: selecting a message auto-marks it read (`mailStore.select`), so the reading
pane usually opens on a read message → "Mark unread" is the common first state.

*Check:* covered by existing behaviour; add one assert on the label-picking helper.

## 6. Maximised message window fills its width

**Problem:** `MessageWindow` body is capped at `mx-auto max-w-[720px]`, so it stays
centred in a narrow column when the window is maximised.

- Drop the `mx-auto max-w-[720px]` wrapper (keep the outer `px-8 py-6` padding) so
  the header + `EmailBody` fill the available width.

*Check:* visual.

## 7. Subfolders, right-click menu, drag-reorder (local only)

**Problem:** no subfolders, no right-click actions, no manual ordering.

**Schema (migration v12):**
```sql
ALTER TABLE folders ADD COLUMN parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
```

**`db/folders.ts`:**
- `createFolder(db, accountId, name, parentId=null)`. Relax the duplicate-name
  check to be **per parent** (same name allowed under different parents).
- `listFolders` returns `parentId` and `sortOrder`.
- New: `moveFolder(db, id, parentId)` (reject cycles / self-parent, standard
  folders can't be nested), `reorderFolder(db, id, sortOrder)` — or simpler,
  `setSiblingOrder(db, ids[])` that writes `sort_order` = index.

**`@shared/db` `FolderSummary`:** add `parentId: number | null`, `sortOrder: number`.

**IPC + preload:** `create-folder` gains `parentId`; add `mail:move-folder` and
`mail:reorder-folders`. Local-only means: for a **child** folder (parentId set),
skip the `imapCreateFolder` call; moves/reorders never touch IMAP.

**`Sidebar.tsx`:**
- Build a tree from custom folders (`parentId`), render children indented one
  level under their parent. Order siblings by `sortOrder` then name. Standard
  mailboxes stay flat and on top as today.
- **Right-click** (`onContextMenu`) on any custom folder → menu: *New subfolder*,
  *Rename*, *Delete*. (Replaces the hover-sliders menu; rename/delete reuse
  existing handlers.)
- **Drag-and-drop** (HTML5 `draggable`): drop a folder **onto** another custom
  folder → becomes its child (`moveFolder`); drop **between** siblings → reorder
  (`setSiblingOrder`). Standard folders aren't drop targets or draggable.
  - `ponytail:` one level of nesting is enough for now; the tree builder handles
    arbitrary depth but the UI only indents/drops one level. Deepen later if asked.

*Check:* unit test on `moveFolder` (rejects self/cycle, rejects nesting standard
folders) and on the tree builder (children group under parents, order respected).

## 8

Covered by item 4.

## 9. Multi-select checkboxes + bulk actions

**Problem:** no way to select multiple messages and act on them together.

- Selection state: add `selectedIds: Set<number>`, `toggleSelected(id)`,
  `clearSelected()`, `selectAll()` to `mailStore` (cleared on folder/label/view
  change — hook into existing `setFolder`/`setLabel`/`setSmartView`).
- `MessageList` `Row`: a checkbox in the left gutter (where the unread dot sits;
  show both). Clicking the checkbox toggles selection **without** opening the
  message (`stopPropagation`).
- Header **Select** button (currently dead, line ~116) → select-all / clear toggle.
- When `selectedIds.size > 0`, show a **bulk action bar** above the list:
  *Mark read*, *Mark unread*, *Delete*, *Move to…* (reuse the folder list from
  `MoveMenu`), and a count + clear. Each action loops the selected ids over the
  existing `markRead` / `mail.action` IPC, then refreshes and clears.
  - `ponytail:` client-side loop over selected ids — fine for a folder's worth of
    mail; batch into one IPC call only if it's ever slow.

*Check:* unit assert that bulk-delete calls `action(id,'trash')` for each selected
id and clears the set.

## 10. Attachments duplicating on every sync/restart

**Problem:** a message with one attachment shows 15, 20, 21… growing by one every
time the app restarts.

**Root cause:** `ingest.ts` (66–75) calls `upsertMessage` — which **updates** an
existing message when the same `(account, folder, remote_uid)` is re-seen — then
**unconditionally** loops `addAttachment`, a blind `INSERT` with no dedup
(`messages.ts:85`). Each re-sync (every restart triggers one) re-ingests the same
message and appends another copy of every attachment.

**Fix — stop the growth:**
- `ingest.ts`: only add attachments when the message row was **newly inserted**.
  `upsertMessage` returns the id but not insert-vs-update; add that signal (return
  `{ id, inserted }` or a sibling `wasInserted` — pick the smaller diff) and guard
  the loop.
- Defensively make `addAttachment` idempotent: skip when a row with the same
  `(message_id, filename, size)` already exists. This preserves any already
  downloaded `local_path`.

**Fix — clean up existing dupes (migration v13):**
```sql
DELETE FROM attachments WHERE id NOT IN (
  SELECT MIN(id) FROM attachments
  GROUP BY message_id, COALESCE(filename,''), COALESCE(size,-1)
);
```
Keeps the earliest row per `(message, filename, size)` — repairs Jamie's 21-copy
message and any other affected messages on next launch.

*Check:* unit test — ingest the same parsed message twice, assert the attachment
count stays 1; and assert the dedup SQL collapses N identical rows to 1.

---

## Files touched (summary)

- `src/renderer/Icon.tsx` — shield icon
- `src/renderer/regions/Sidebar.tsx` — shield mapping, folder tree, context menu, DnD
- `src/renderer/TitleBar.tsx`, `src/renderer/App.tsx` — View menu wiring
- `src/renderer/mail/EmailBody.tsx` — auto-load + remembered images
- `src/renderer/regions/ReadingPane.tsx` — read/unread toggle, pass junk flag
- `src/renderer/MessageWindow.tsx` — read/unread toggle, width fill, junk flag
- `src/renderer/regions/MessageList.tsx` — checkboxes + bulk bar
- `src/renderer/store/mailStore.ts` — selection state, clear-on-nav
- `src/db/schema.ts` — migration v12 (parent_id, sort_order), v13 (dedupe attachments)
- `src/main/mail/ingest.ts` — only add attachments when message is new
- `src/db/messages.ts` — folderRole in getMessage, idempotent addAttachment, insert signal
- `src/db/folders.ts` — parentId create, move/reorder, tree-friendly list
- `src/shared/db.ts` / `types.ts` — FolderSummary + MessageDetail fields
- `src/main/index.ts`, `src/preload/index.ts` — folder move/reorder IPC, parentId
- tests: folder move/tree, bulk-action loop, image default helper, attachment dedup

## Out of scope

- IMAP-side folder nesting / server reordering (local only, by decision).
- Persisting junk image-loads across app restarts (in-memory only).
- Dark-mode email bodies (dropped).
