# Sidebar & Message-Handling Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ten sidebar / message-view issues in DeskMail AI and add local subfolders + multi-select bulk actions.

**Architecture:** Electron + React + zustand renderer over a `node-sqlite3-wasm` SQLite cache reached through an IPC bridge (`window.deskmail`). DB logic lives in `src/db/*`, main-process handlers in `src/main/index.ts`, the preload bridge in `src/preload/index.ts`, and UI in `src/renderer/*`. Subfolders and ordering are **local-only** (no IMAP). Follow existing file patterns.

**Tech Stack:** TypeScript, React 18, zustand, Tailwind, vitest (unit), Playwright (e2e), node-sqlite3-wasm.

## Global Constraints

- Test command: `npm test` (vitest run). Typecheck: `npm run typecheck`.
- British English in all user-facing copy; first-person voice where copy is authored.
- Never edit a shipped migration — append only. Current `user_version` is **11**; this plan adds **v12** and **v13** → new version **13**.
- Standard mailboxes (role != null) are protected: not renamable, deletable, nestable, draggable, or drop targets.
- `ponytail:` comments mark deliberate simplifications; keep them.

---

### Task 1: DB migrations v12 + v13

**Files:**
- Modify: `src/db/schema.ts` (append to `MIGRATIONS`)
- Test: `tests/unit/db.test.ts` (bump version assertions 11 → 13)

**Interfaces:**
- Produces: `folders.parent_id INTEGER NULL`, `folders.sort_order INTEGER NOT NULL DEFAULT 0`; a de-duplicated `attachments` table.

- [ ] **Step 1: Append migrations** to the `MIGRATIONS` array in `schema.ts`:

```ts
  // --- v12: local subfolders + manual folder ordering -------------------------
  `ALTER TABLE folders ADD COLUMN parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
   ALTER TABLE folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,

  // --- v13: repair duplicated attachment rows (blind re-INSERT on every sync) --
  `DELETE FROM attachments WHERE id NOT IN (
     SELECT MIN(id) FROM attachments
     GROUP BY message_id, COALESCE(filename,''), COALESCE(size,-1)
   );`
```

- [ ] **Step 2: Update `db.test.ts`** — change both `expect(version).toBe(11)` to `toBe(13)`.

- [ ] **Step 3: Run** `npm test -- db.test` → PASS.

- [ ] **Step 4: Commit** `fix(db): v12 subfolder columns + v13 attachment dedup`.

---

### Task 2: Stop attachment duplication on re-sync

**Files:**
- Modify: `src/db/messages.ts` (`upsertMessage` return, `addAttachment`)
- Modify: `src/main/mail/ingest.ts` (guard the attachment loop)
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces: `upsertMessage(...) => number` unchanged for callers, plus new `upsertMessageEx(...) => { id: number; inserted: boolean }` **OR** change `upsertMessage` to return `{ id, inserted }`. Chosen: keep `upsertMessage` returning `number` (many callers) and add `wasInserted` via a second return is messy — instead make `addAttachment` idempotent and guard ingest by checking existing attachments. Final approach below.

- [ ] **Step 1: Write failing test** in `db.test.ts`:

```ts
it('does not duplicate attachments when the same message is ingested twice', () => {
  const db = openDatabase(file)
  ensureStandardFolders(db, 1) // needs an account+folder; see existing helpers
  // minimal message
  const id = upsertMessage(db, { accountId: 1, folderId: 1, remoteUid: 42, to: [], cc: [], bcc: [] } as any, true)
  addAttachment(db, id, 'brief.pdf', 'application/pdf', 1000, null)
  addAttachment(db, id, 'brief.pdf', 'application/pdf', 1000, null) // second sync
  const rows = db.all('SELECT * FROM attachments WHERE message_id = ?', [id]) as unknown[]
  expect(rows.length).toBe(1)
  db.close()
})
```
(Adjust account/folder setup to match how other tests in the file seed rows — insert an account first via `insertAccount`.)

- [ ] **Step 2: Run** `npm test -- db.test` → FAIL (2 rows).

- [ ] **Step 3: Make `addAttachment` idempotent** in `messages.ts` — skip when a row with the same `(message_id, filename, size)` exists:

```ts
export function addAttachment(
  db: DB,
  messageId: number,
  filename: string | null,
  mimeType: string | null,
  size: number | null,
  localPath: string | null
): void {
  const dupe = db.get(
    `SELECT id FROM attachments WHERE message_id = ?
       AND COALESCE(filename,'') = COALESCE(?, '')
       AND COALESCE(size,-1)    = COALESCE(?, -1)`,
    [messageId, filename, size]
  ) as { id: number } | undefined
  if (dupe) return // ponytail: metadata dedup keyed on name+size; preserves any downloaded local_path
  db.run(
    `INSERT INTO attachments (message_id, filename, mime_type, size, local_path, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [messageId, filename, mimeType, size, localPath, localPath ? new Date().toISOString() : null]
  )
}
```

- [ ] **Step 4: Run** `npm test -- db.test` → PASS.

- [ ] **Step 5:** No ingest change needed — the idempotent guard covers the re-sync loop. Leave `ingest.ts:71-75` as-is.

- [ ] **Step 6: Commit** `fix(mail): dedupe attachments so re-sync stops duplicating them`.

---

### Task 3: Folder tree data — parentId, move, reorder

**Files:**
- Modify: `src/db/folders.ts` (`createFolder`, `listFolders`, add `moveFolder`, `reorderFolders`)
- Modify: `src/shared/db.ts` (`FolderSummary` gains `parentId`, `sortOrder`)
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces:
  - `createFolder(db, accountId, name, parentId: number | null = null) => number`
  - `moveFolder(db, id, parentId: number | null) => void` (rejects self-parent, cycles, standard folders)
  - `reorderFolders(db, ids: number[]) => void` (writes `sort_order = index`)
  - `listFolders(...)` returns `FolderSummary { …, parentId, sortOrder }`

- [ ] **Step 1: Extend `FolderSummary`** in `src/shared/db.ts`: add `parentId: number | null` and `sortOrder: number`.

- [ ] **Step 2: Write failing tests** in `db.test.ts`:

```ts
it('creates a subfolder under a parent and lists parentId', () => {
  const db = openDatabase(file); const acc = insertAccount(db, SAMPLE_ACCOUNT)
  const parent = createFolder(db, acc, 'Clients')
  const child = createFolder(db, acc, 'Norway', parent)
  const f = listFolders(db, acc).find((x) => x.id === child)!
  expect(f.parentId).toBe(parent)
  db.close()
})

it('moveFolder rejects making a folder its own parent', () => {
  const db = openDatabase(file); const acc = insertAccount(db, SAMPLE_ACCOUNT)
  const a = createFolder(db, acc, 'A')
  expect(() => moveFolder(db, a, a)).toThrow()
  db.close()
})

it('reorderFolders writes sort_order by index', () => {
  const db = openDatabase(file); const acc = insertAccount(db, SAMPLE_ACCOUNT)
  const a = createFolder(db, acc, 'A'); const b = createFolder(db, acc, 'B')
  reorderFolders(db, [b, a])
  const f = listFolders(db, acc)
  expect(f.find((x) => x.id === b)!.sortOrder).toBe(0)
  expect(f.find((x) => x.id === a)!.sortOrder).toBe(1)
  db.close()
})
```
(Use the file's existing sample account constant; if none, build a minimal `AccountInput`.)

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement** in `folders.ts`:

```ts
// createFolder — add optional parentId; dedupe within the same parent only.
export function createFolder(db: DB, accountId: number, name: string, parentId: number | null = null): number {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name.')
  const dupe = db.get(
    'SELECT id FROM folders WHERE account_id = ? AND IFNULL(parent_id,-1) = IFNULL(?,-1) AND LOWER(name) = LOWER(?)',
    [accountId, parentId, trimmed]
  ) as { id: number } | undefined
  if (dupe) throw new Error(`There's already a folder called “${trimmed}” here.`)
  db.run(
    'INSERT INTO folders (account_id, name, role, remote_path, parent_id) VALUES (?, ?, NULL, ?, ?)',
    [accountId, trimmed, trimmed, parentId]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

// moveFolder — reparent a custom folder locally. Guards against cycles.
export function moveFolder(db: DB, id: number, parentId: number | null): void {
  const f = getFolder(db, id)
  if (!f) throw new Error('That folder no longer exists.')
  if (f.role) throw new Error('The standard folders can’t be moved.')
  if (parentId != null) {
    if (parentId === id) throw new Error('A folder can’t be its own parent.')
    const target = getFolder(db, parentId)
    if (!target) throw new Error('That destination folder no longer exists.')
    if (target.role) throw new Error('The standard folders can’t hold subfolders.')
    // walk up from target; if we reach id, it's a cycle
    let cur: number | null = parentId
    while (cur != null) {
      if (cur === id) throw new Error('You can’t move a folder into one of its own subfolders.')
      cur = (db.get('SELECT parent_id FROM folders WHERE id = ?', [cur]) as { parent_id: number | null } | undefined)?.parent_id ?? null
    }
  }
  db.run('UPDATE folders SET parent_id = ? WHERE id = ?', [parentId, id])
}

// reorderFolders — persist sibling order as given.
export function reorderFolders(db: DB, ids: number[]): void {
  ids.forEach((id, i) => db.run('UPDATE folders SET sort_order = ? WHERE id = ?', [i, id]))
}
```

Add `parent_id` and `sort_order` to `getFolder`'s SELECT, and to `listFolders`' select + mapping (`parentId: r.parent_id, sortOrder: r.sort_order`). Order `listFolders` by `sort_order, id`.

- [ ] **Step 5: Run** → PASS. Run full `npm test` to catch fallout.

- [ ] **Step 6: Commit** `feat(folders): local subfolders + move/reorder`.

---

### Task 4: getMessage returns folderRole

**Files:**
- Modify: `src/db/messages.ts` (`getMessage` join)
- Modify: `src/shared/db.ts` (`MessageDetail` gains `folderRole: string | null`)
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces: `MessageDetail.folderRole: string | null` (the role of the message's folder, e.g. `'junk'`).

- [ ] **Step 1:** Add `folderRole: string | null` to `MessageDetail` in `src/shared/db.ts`.

- [ ] **Step 2:** In `getMessage` (`messages.ts`), join folders and return the role. Locate the message-row SELECT (~line 150-200) and add `(SELECT role FROM folders WHERE id = m.folder_id) AS folder_role`, then map `folderRole: r.folder_role ?? null` into the returned object.

- [ ] **Step 3:** Quick test — ingest a message into the junk folder, assert `getMessage(id).folderRole === 'junk'`.

- [ ] **Step 4: Run** → PASS. **Commit** `feat(mail): expose folderRole on message detail`.

---

### Task 5: IPC + preload for subfolders / move / reorder

**Files:**
- Modify: `src/main/index.ts` (`mail:create-folder` +parentId; add `mail:move-folder`, `mail:reorder-folders`)
- Modify: `src/preload/index.ts` (mirror the new calls)

**Interfaces:**
- Consumes: `createFolder`, `moveFolder`, `reorderFolders` from Task 3.
- Produces bridge methods:
  - `window.deskmail.mail.createFolder(accountId, name, parentId?)`
  - `window.deskmail.mail.moveFolder(id, parentId)`
  - `window.deskmail.mail.reorderFolders(ids)`

- [ ] **Step 1:** In `main/index.ts`, update the create handler — only sync to IMAP for **top-level** folders (local-only subfolders):

```ts
ipcMain.handle('mail:create-folder', (_e, accountId: number, name: string, parentId?: number | null) => {
  const id = createFolder(db, accountId, name, parentId ?? null)
  if (parentId == null) void imapCreateFolder(db, accountId, name).finally(broadcastMailChanged) // ponytail: subfolders stay local
  broadcastMailChanged()
  return { id }
})
ipcMain.handle('mail:move-folder', (_e, id: number, parentId: number | null) => {
  moveFolder(db, id, parentId); broadcastMailChanged()
})
ipcMain.handle('mail:reorder-folders', (_e, ids: number[]) => {
  reorderFolders(db, ids); broadcastMailChanged()
})
```
Import `moveFolder, reorderFolders` from `../db/folders`.

- [ ] **Step 2:** In `preload/index.ts` `mail` block, update `createFolder` signature and add the two methods:

```ts
createFolder: (accountId: number, name: string, parentId?: number | null) =>
  ipcRenderer.invoke('mail:create-folder', accountId, name, parentId),
moveFolder: (id: number, parentId: number | null) => ipcRenderer.invoke('mail:move-folder', id, parentId),
reorderFolders: (ids: number[]) => ipcRenderer.invoke('mail:reorder-folders', ids),
```
Update the matching TypeScript interface for `window.deskmail` (search the preload file / `src/renderer/env.d.ts` for where `mail.createFolder` is typed).

- [ ] **Step 3: Run** `npm run typecheck` → PASS. **Commit** `feat(ipc): folder create-with-parent, move, reorder`.

---

### Task 6: Junk shield icon

**Files:**
- Modify: `src/renderer/Icon.tsx` (`IconName` + `PATHS`)
- Modify: `src/renderer/regions/Sidebar.tsx` (`folderIcon`)

- [ ] **Step 1:** Add `'shield'` to the `IconName` union and to `PATHS`:

```ts
shield: 'M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z',
```

- [ ] **Step 2:** In `Sidebar.tsx` `folderIcon`, change the junk line:

```ts
if (r.includes('junk') || r.includes('spam')) return 'shield'
```

- [ ] **Step 3: Run** `npm run typecheck` → PASS. Verify in app. **Commit** `feat(ui): shield icon for junk/spam`.

---

### Task 7: Wire up the title-bar View menu

**Files:**
- Modify: `src/renderer/App.tsx` (pass props to `TitleBar`)
- Modify: `src/renderer/TitleBar.tsx` (accept + wire props)

**Interfaces:**
- Consumes: existing `setMode`, `setViewSettingsOpen` in `App.tsx`.

- [ ] **Step 1:** `TitleBar` signature → add props:

```ts
export function TitleBar({ onOpenSettings, onCompose, onOpenViewSettings, onMode }:
  { onOpenSettings: () => void; onCompose: () => void; onOpenViewSettings: () => void; onMode: (m: 'mail' | 'calendar') => void }): JSX.Element {
```

- [ ] **Step 2:** Wire the `View` menu items:

```ts
View: [
  { label: 'Mail', onClick: () => onMode('mail') },
  { label: 'Calendar', onClick: () => onMode('calendar') },
  'sep',
  { label: 'View settings…', onClick: onOpenViewSettings },
  { label: 'Toggle light / dark', onClick: toggleTheme }
],
```

- [ ] **Step 3:** In `App.tsx`, pass them:

```tsx
<TitleBar
  onOpenSettings={() => setSettingsOpen(true)}
  onCompose={openCompose}
  onOpenViewSettings={() => setViewSettingsOpen(true)}
  onMode={(m) => setMode(m)}
/>
```

- [ ] **Step 4: Run** `npm run typecheck` → PASS. **Commit** `fix(ui): wire up title-bar View menu`.

---

### Task 8: Auto-load images (except Junk), remembered across re-renders

**Files:**
- Modify: `src/renderer/mail/EmailBody.tsx`

**Interfaces:**
- Produces: `EmailBody({ html, text, allowByDefault, messageId })` — `allowByDefault` seeds image loading; `messageId` keys the remembered-loads set.

- [ ] **Step 1:** Add a module-level remembered set and a prop-driven initial state:

```ts
// Remembers messages where the user chose to load images, so switching folders
// and back doesn't re-block them. ponytail: in-memory; resets on app restart.
const imagesLoaded = new Set<number>()

export function EmailBody({ html, text, allowByDefault = true, messageId }:
  { html: string | null; text: string | null; allowByDefault?: boolean; messageId?: number }): JSX.Element {
  const remembered = messageId != null && imagesLoaded.has(messageId)
  const [allowImages, setAllowImages] = useState(allowByDefault || remembered)
```

- [ ] **Step 2:** In the "Load images" button handler, remember the choice:

```ts
onClick={() => { setAllowImages(true); if (messageId != null) imagesLoaded.add(messageId) }}
```

- [ ] **Step 3:** Add a tiny self-check (assert-based `demo` in the file or a unit test): `initialAllow(false, false) === false`, `initialAllow(true, false) === true`, `initialAllow(false, true) === true`. (Extract the `allowByDefault || remembered` into a small exported `initialAllow(allowByDefault, remembered)` helper and test it in `tests/unit`.)

- [ ] **Step 4: Run** `npm test` → PASS. **Commit** `feat(mail): auto-load images except junk, remember manual loads`.

---

### Task 9: ReadingPane — read/unread toggle + pass junk flag

**Files:**
- Modify: `src/renderer/regions/ReadingPane.tsx`

**Interfaces:**
- Consumes: `EmailBody` `allowByDefault`, `messageId` (Task 8); `MessageDetail.isRead`; `window.deskmail.mail.markRead`.

- [ ] **Step 1:** Replace the static Mark-unread button with a toggle. `inJunk` already exists here; also get the store `refresh` (`const refresh = useMail((s) => s.refresh)`):

```tsx
<ToolBtn
  icon="markUnread"
  title={m.isRead ? 'Mark unread' : 'Mark read'}
  onClick={() => {
    void window.deskmail.mail.markRead(m.id, !m.isRead).then(() => refresh())
    showToast({ text: m.isRead ? 'Marked unread' : 'Marked read' })
  }}
/>
```

- [ ] **Step 2:** Pass junk/messageId to `EmailBody`:

```tsx
<EmailBody html={m.bodyHtml} text={m.bodyText} allowByDefault={!inJunk} messageId={m.id} />
```

- [ ] **Step 3: Run** `npm run typecheck` → PASS. **Commit** `feat(mail): read/unread toggle in reading pane; junk-aware images`.

---

### Task 10: MessageWindow — read/unread toggle, junk flag, fill width

**Files:**
- Modify: `src/renderer/MessageWindow.tsx`

- [ ] **Step 1:** Remove the static `Mark unread` from `ACTIONS`; render it as a dynamic button after the map (or special-case inside). Simplest — drop it from the array and add a standalone button in the toolbar:

```tsx
<button
  title={m.isRead ? 'Mark unread' : 'Mark read'}
  onClick={() => { void window.deskmail.mail.markRead(m.id, !m.isRead); setM({ ...m, isRead: !m.isRead }) }}
  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-raised"
>
  <Icon name="markUnread" size={16} />
  <span>{m.isRead ? 'Mark unread' : 'Mark read'}</span>
</button>
```

- [ ] **Step 2:** Fill width — change the body wrapper `<div className="mx-auto max-w-[720px]">` to `<div className="w-full">` (outer `px-8 py-6` keeps margins).

- [ ] **Step 3:** Junk-aware images — pass `allowByDefault={m.folderRole !== 'junk'}` and `messageId={m.id}` to `EmailBody`.

- [ ] **Step 4: Run** `npm run typecheck` → PASS. **Commit** `feat(mail): message window read toggle, fill width, junk-aware images`.

---

### Task 11: Sidebar — folder tree, right-click menu, drag-reorder/nest

**Files:**
- Modify: `src/renderer/regions/Sidebar.tsx`

**Interfaces:**
- Consumes: `FolderSummary.parentId/sortOrder`; `window.deskmail.mail.{createFolder(parentId), moveFolder, reorderFolders}`.

- [ ] **Step 1:** Replace custom-folder rendering with a tree. Build children map from `parentId`, render roots then recurse one visible level, indenting children (`paddingLeft`). Standard folders (role != null) render first, flat, unchanged.

- [ ] **Step 2:** `CustomFolderRow` — swap the hover-sliders menu for a right-click context menu (`onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true) }}`) with items **New subfolder**, **Rename**, **Delete**. "New subfolder" opens the inline name input and calls `createFolder(accountId, name, f.id)`.

- [ ] **Step 3:** Drag-and-drop with native HTML5 DnD on custom rows:
  - `draggable`, `onDragStart` sets `e.dataTransfer.setData('text/folder', String(f.id))`.
  - `onDragOver` `e.preventDefault()` to allow drop; show a hover indicator.
  - `onDrop` — dropped-onto-a-folder ⇒ `moveFolder(draggedId, f.id)`; dropped in the gap between siblings ⇒ compute new sibling order array and call `reorderFolders(ids)`.
  - Guard: ignore drops where dragged === target or target is a standard folder.
  - `ponytail:` single visible nesting level; drop-onto = nest, drop-between = reorder.

- [ ] **Step 4:** Manual test in the app: create folder, right-click → New subfolder, drag to reorder, drag onto another to nest, rename, delete. Confirm order/nesting persists across a restart (`npm run dev`).

- [ ] **Step 5: Run** `npm run typecheck` and `npm test` → PASS. **Commit** `feat(sidebar): folder tree, context menu, drag to nest/reorder`.

---

### Task 12: Multi-select checkboxes + bulk actions

**Files:**
- Modify: `src/renderer/store/mailStore.ts` (selection state)
- Modify: `src/renderer/regions/MessageList.tsx` (checkboxes + bulk bar)
- Test: `tests/unit` (bulk-delete helper)

**Interfaces:**
- Produces in `mailStore`: `selectedIds: Set<number>`, `toggleSelected(id)`, `clearSelected()`, `selectAll(ids)`. Cleared inside `setFolder`/`setLabel`/`setSmartView`.

- [ ] **Step 1:** Add to `MailState` and the store:

```ts
selectedIds: new Set<number>(),
toggleSelected: (id) => set((s) => {
  const next = new Set(s.selectedIds); next.has(id) ? next.delete(id) : next.add(id); return { selectedIds: next }
}),
clearSelected: () => set({ selectedIds: new Set() }),
selectAll: (ids: number[]) => set({ selectedIds: new Set(ids) }),
```
Add `selectedIds: new Set()` reset to each `setFolder`/`setLabel`/`setSmartView` `set({...})` call.

- [ ] **Step 2:** In `MessageList` `Row`, add a checkbox in the left gutter (alongside the unread dot). Clicking it toggles selection without opening:

```tsx
<input
  type="checkbox"
  checked={checked}
  onClick={(e) => e.stopPropagation()}
  onChange={() => onToggleSelect()}
  className="mt-3.5 h-3.5 w-3.5 flex-none accent-[var(--accent)]"
/>
```
Thread `checked` / `onToggleSelect` from the list via `useMail` `selectedIds` + `toggleSelected`.

- [ ] **Step 3:** Wire the existing header **Select** button (line ~116) to select-all / clear (`selectedIds.size ? clearSelected() : selectAll(messages.map(m => m.id))`).

- [ ] **Step 4:** Bulk action bar — render above the list when `selectedIds.size > 0`: count, **Mark read**, **Mark unread**, **Delete**, **Move to…** (reuse folder list), **Clear**. Each loops the ids then refreshes + clears:

```ts
const bulk = async (fn: (id: number) => Promise<void> | void) => {
  for (const id of selectedIds) await fn(id)
  await refresh(); clearSelected()
}
// Mark read:   () => bulk((id) => window.deskmail.mail.markRead(id, true))
// Mark unread: () => bulk((id) => window.deskmail.mail.markRead(id, false))
// Delete:      () => bulk((id) => window.deskmail.mail.action(id, 'trash'))
// Move to f:   () => bulk((id) => window.deskmail.mail.action(id, 'move', f.id))
```
`ponytail:` client-side loop; batch into one IPC only if it's ever slow.

- [ ] **Step 5:** Add a unit test for a `bulkOps` helper (extract the id-loop mapping so it's testable without the DOM): assert delete maps each id to `action(id,'trash')`.

- [ ] **Step 6: Run** `npm test` and `npm run typecheck` → PASS. Manual test: select several, mark read/unread, move, delete. **Commit** `feat(mail): multi-select checkboxes + bulk actions`.

---

## Self-Review notes

- **Spec coverage:** items 1(T6), 2(T7), 3(dropped), 4+8(T8/T9/T10), 5(T9/T10), 6(T10), 7(T3/T5/T11), 9(T12), 10(T1/T2). All covered.
- **Type consistency:** `createFolder(...parentId?)`, `moveFolder(id, parentId)`, `reorderFolders(ids)`, `FolderSummary.parentId/sortOrder`, `MessageDetail.folderRole`, `EmailBody(allowByDefault, messageId)`, `mailStore.selectedIds/toggleSelected/clearSelected/selectAll` — used consistently across tasks.
- **Order:** DB → db logic → ipc/preload → UI, so each task builds on committed interfaces.
