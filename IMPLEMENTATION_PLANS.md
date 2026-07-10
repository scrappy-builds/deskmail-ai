# DeskMail AI — Implementation Plans

One plan per item in [`IMPROVEMENTS.md`](IMPROVEMENTS.md), numbered to match. Each plan pins down
the approach, the exact files, data-model changes, key interfaces, tests, effort and dependencies —
enough that "build plan N" can start immediately without re-deriving the design.

**How these get used:** when an item is ticked in IMPROVEMENTS.md, its plan here is expanded into a
full step-by-step build plan (failing test → code → passing test → commit, per the house method)
against the code *as it stands then*, then built. Delete the plan when its item ships.

*(2026-07-10: the 30-item batch shipped; its plans were deleted. What's left matches the
outstanding backlog exactly. Note for plan 1: the connection pool (`connectionPool.ts`), IMAP IDLE
(`idle.ts`), Sent-mail save and Focused-inbox classification now exist — plan 1's sync rework
should build on `withConnection` and keep the INBOX-only junk/rules/focus pipeline calls.)*

**Conventions assumed by every plan** (the codebase's established patterns):
- DB access = pure functions in `src/db/*.ts` taking a `DB` handle; unit-testable without Electron.
- Schema changes = **append** a new entry to `MIGRATIONS` in `src/db/schema.ts` (never edit a
  shipped one). Plans say "append a migration" rather than hard-coding version numbers, because the
  next number depends on build order.
- Main↔renderer = `ipcMain.handle('domain:verb', …)` in `src/main/index.ts`, exposed through
  `src/preload/index.ts` on `window.deskmail`, typed in `src/shared/types.ts`.
- UI state = Zustand stores in `src/renderer/store/`; toasts via `toastStore`.
- Tests = Vitest units in `tests/unit/*.test.ts` (pure logic gets a unit test), Playwright-Electron
  E2E in `tests/e2e/*.spec.ts` (one per user-visible behaviour). Copy in Jamie's voice.
- MCP tools = entries in `buildTools(db)` in `src/mcp/tools.ts` (`{name, description, inputSchema
  (zod), handler}`), with the tool-surface unit test in `tests/unit/mcp.test.ts` updated to match.

---

## Tier 1

### Plan 1 — Full mail sync (all folders, deeper history, incremental)

**What:** Sync every IMAP folder, incrementally by UID, with configurable history depth and
on-demand back-fill — replacing the "re-fetch INBOX's last 50" loop.

**Approach:**
- New per-folder sync cursor. The existing `sync_state` table is an append-only log (an INSERT per
  run) — keep it as the log, and add a proper cursor table via migration:
  `folder_sync (folder_id INTEGER PRIMARY KEY, uidvalidity INTEGER, last_seen_uid INTEGER,
  backfill_low_uid INTEGER)`.
- Rework `syncAccount` in `src/main/mail/sync.ts` (it already runs inside
  `withConnection` from the pool — keep that):
  1. List folders (as now), upsert each.
  2. For each folder with a `remote_path` (skip role `drafts` — local drafts are authoritative):
     open the mailbox, read `uidValidity` + `uidNext`.
     - `uidValidity` changed → wipe the cursor (and that folder's cached UIDs are stale: delete its
       messages, resync fresh). Rare, but must be handled or the cache silently corrupts.
     - New mail: fetch `last_seen_uid+1:*` by UID, run through the existing `ingestRaw` →
       `applyJunkIfSpam` → `applyRulesToMessage` → `applyFocusClassification` pipeline (INBOX-only
       for junk/rules/focus — keep that check explicit so Sent mail is never junk-filtered).
     - Initial/back-fill: fetch downwards from `backfill_low_uid` in pages of 200 until the depth
       setting is met. Depth = `app_settings` key `sync-depth-days` (default `365`, `0` = everything).
  3. Flag reconciliation: for the most recent window (e.g. newest 500 UIDs per folder), fetch flags
     only and update `is_read`/`is_starred`, and mark messages deleted-on-server (UID no longer
     present) by moving them to Trash locally. Cheap, keeps two-way state honest without QRESYNC.
- Ingest already dedupes by `(account, folder, uid)` and attachment rows are idempotent — reuse as
  is. **New wrinkle since the plan was written:** locally-appended Sent copies have `remote_uid
  NULL`; when the Sent folder first syncs for real, dedupe those by `message_id_header` within the
  folder so each sent message doesn't appear twice (the duplicate-cleanup helper already exists).
- UI: sidebar folder click already lists from the local store, so folders simply fill up. Add a
  "Load older messages" button at the bottom of `MessageList` when `backfill_low_uid > 1` → new IPC
  `mail:backfill(folderId)` → one more page. Progress via `mail:changed` broadcasts (already exists).
- First-run experience: seed newest page per folder first (fast), then back-fill in the background
  so the app is usable immediately. The IDLE `onNewMail` targeted sync (already built) keeps INBOX
  instant regardless.

**Files:** modify `src/main/mail/sync.ts` (bulk of the work), `src/db/folders.ts` (cursor CRUD —
or a new `src/db/folderSync.ts`), `src/db/schema.ts` (migration), `src/main/index.ts` (backfill
IPC + settings), `src/preload/index.ts`, `src/shared/types.ts`, `src/renderer/regions/MessageList.tsx`
(Load older), `src/renderer/settings/panes.tsx` (sync-depth setting).

**Tests:** unit — cursor logic as pure functions (given uidvalidity/uidnext/cursor → what to fetch),
uidvalidity-change wipes, depth paging maths, flag-reconcile diffing. E2E — seeded multi-folder
mailbox shows mail in a non-INBOX folder after sync; "Load older" adds rows. (IMAP itself is mocked
at the imapflow boundary as in existing sync tests.)

**Effort:** big (2–4 days). **Depends on:** nothing (pool + IDLE already shipped). **Unlocks:**
plan 32's measurement, richer history for focus/nudges/attachments browser.

---

### Plan 3 — Keyboard shortcuts

**What:** Global single-key shortcuts: `j`/`k` next/previous message, `Enter` open, `e` archive,
`#` delete, `r` reply, `c` compose, `/` focus search, `u` toggle unread, `?` cheat-sheet overlay.

**Approach:**
- One `keydown` listener on `window` in a new `src/renderer/shortcuts.ts`:
  `installShortcuts(actions: ShortcutActions): () => void`, mounted from `App.tsx` via `useEffect`.
- Guard: ignore when `event.target` is an input/textarea/`[contenteditable]`, when a modal is open
  (check the existing modal state in `layoutStore` / document query), or when a modifier is held.
- The action map calls existing store/IPC functions: `mailStore` already has selection +
  `messageNeighbours`; archive/delete/unread go through the existing `messageActions` helpers;
  reply opens Compose with `buildReplyDraft` (already exists); `/` focuses the command-bar search
  input by id. The virtualised list (shipped) already scrolls the selected row into view on
  selection change, so `j`/`k` work at 20k messages.
- `?` opens a small cheat-sheet modal (`src/renderer/ShortcutHelp.tsx`) listing the map — static
  content, styled like the existing modals. Include the `Win+.` emoji hint here.
- Keep the map a plain object so the cheat-sheet renders from the same source of truth. No
  user-configurable bindings (YAGNI — add only if ever asked).

**Files:** create `src/renderer/shortcuts.ts`, `src/renderer/ShortcutHelp.tsx`; modify
`src/renderer/App.tsx`, small additions to `src/renderer/store/mailStore.ts` (selectNext/Prev if
not already exposed).

**Tests:** unit — the key→action dispatch as a pure function (event-like input → action name |
null, incl. the input-focus guard). E2E — press `j` then `Enter` opens the second message; `/`
focuses search; typing `j` *inside* search does not navigate.

**Effort:** med. **Depends on:** nothing.

---

### Plan 4 — Default mail app (mailto: handler)

**What:** Register DeskMail as a Windows mailto: handler; clicking an email link anywhere opens
Compose pre-filled.

**Approach:**
- Registration: `app.setAsDefaultProtocolClient('mailto')` on startup (works for the packaged app),
  plus a "Make DeskMail my default email app" button in Settings → Accounts that calls it and
  explains Windows' Settings→Apps confirmation. electron-builder NSIS registers the ProgID via the
  `protocols` entry in `electron-builder.yml` (a `deskmail` scheme entry already exists there —
  add `mailto` alongside it).
- Single-instance: **already built** for the toast quick actions — extend `handleProtocolArgs` in
  `src/main/index.ts` to also recognise an argument starting `mailto:` (both in `second-instance`
  and first-launch argv).
- Parsing: pure `parseMailto(url: string): {to: string[], cc: string[], bcc: string[], subject:
  string, body: string}` in `src/shared/mailto.ts` — `URL` + `URLSearchParams` handles the RFC 6068
  forms (`mailto:a@b?subject=…&cc=…`), decode `%20`/`+`.
- Open: the compose window is already its own entry (`compose.html`) — the cleanest prefill path is
  the existing one: `saveDraft(payload)` → `openComposeWindow(draftId)`.

**Files:** create `src/shared/mailto.ts`; modify `src/main/index.ts` (protocol + argv handling),
`electron-builder.yml`, `src/renderer/settings/panes.tsx` (the button).

**Tests:** unit — `parseMailto` over plain address, multi-recipient, subject+body encoding, junk
input → empty fields (trust boundary: this string comes from outside the app). E2E — launch with a
`mailto:` argv → Compose opens with the To field filled.

**Effort:** easy. **Depends on:** nothing.

---

## Tier 3

### Plan 25 — POP3 sync

**What:** Real POP3 sync for POP3-configured accounts (download-only, INBOX-only by nature).

**Approach:** no maintained Node POP3 client worth adding — implement the minimal client over
`tls.connect` in `src/main/mail/pop3.ts` (~150 lines): `USER/PASS`, `STAT`, `UIDL` (incremental
cursor = highest seen UIDL per account, stored in `folder_sync` from plan 1 or its own key),
`RETR`, `QUIT`. Feed each raw message through the existing `ingestRaw` into the account's local
INBOX folder. No delete-from-server (leave mail on server — safest default, note in the wizard).
Extend `connectionTest.ts` to do a real auth check. **Gate:** confirm an actual POP3 account is
wanted before building — otherwise this stays parked.

**Files:** create `src/main/mail/pop3.ts`; modify `src/main/mail/sync.ts` (dispatch by
`incoming_type`), `src/main/mail/connectionTest.ts`.

**Tests:** unit — protocol state machine against a scripted fake server (net socket pair);
UIDL-cursor incremental logic. E2E — not worth a live server; unit coverage suffices.

**Effort:** med. **Depends on:** plan 1's cursor table (convenient, not required).

---

### Plan 26 — Local database encryption / master password

**What:** Encrypt message content at rest. **Status: blocked — recorded honestly.**

**The problem:** `node-sqlite3-wasm` has no SQLCipher variant, and this machine has no MSVC
toolchain, which is why the WASM driver was chosen at all (PROGRESS.md, Stage 4). Every real
option changes the driver:
1. **`better-sqlite3-multiple-ciphers`** — the right answer *if* native builds become possible
   (install VS Build Tools, or a Node version with prebuilds for it). Migration path: open old DB,
   `sqlcipher_export` into the encrypted file, swap the driver behind `src/db/database.ts` (the
   API was deliberately kept better-sqlite3-shaped, so the swap is contained).
2. **App-level field encryption** (encrypt `body_html`/`body_text` columns with a safeStorage-held
   key) — breaks FTS search entirely (can't index ciphertext). Not acceptable.
3. **Do nothing + BitLocker** — device encryption already covers the stolen-laptop case this item
   exists for.

**Decision recorded:** option 3 now; revisit option 1 only if the toolchain situation changes.
If picked up, the plan is: install toolchain → add driver behind the existing `DB` interface →
one-time export/import migration on first launch → E2E asserting plaintext bodies absent from the
DB file (mirroring the existing credentials E2E).

**Effort:** big (and toolchain-gated). **Depends on:** native build capability.

---

## Performance & reliability

### Plan 32 — Database work off the main thread

**What:** Stop synchronous WASM SQLite calls from janking the app under a full mailbox.
**Status: measure first — do not build speculatively.**

**Approach:**
1. **Measure** (after plan 1 fills the store): seed 50k messages, watch for main-process stalls
   during search / folder switch / sync (the Performance tab + a simple >16ms-call logger around
   `db.all`). If nothing janks, stop — the item stays parked.
2. If it janks, the contained fix first: audit the slow queries (indexes exist on
   `folder_id, received_at` — search/threads may need composite or covering indexes; FTS is
   already indexed). Cheap and usually sufficient.
3. Only if still janky: move the `DB` behind `worker_threads` — a worker owning the database, a
   promise-RPC wrapper implementing the same `DB` method shapes (`all/get/run` become async). The
   renderer never notices (it's already behind async IPC), but every main-process call site gains
   an `await` — a mechanical but wide diff (~40 call sites), which is why steps 1–2 gate it.

**Files (step 3 only):** create `src/db/dbWorker.ts`, `src/db/dbClient.ts`; modify every
main-process db call site + `src/mcp/server.ts` (which can stay synchronous — separate process).

**Tests:** step 3 — existing unit suite runs against the worker client (same interface); a stall
test is impractical, rely on the measurements.

**Effort:** big (step 3) / easy (steps 1–2). **Depends on:** plan 1 (real data to measure).
