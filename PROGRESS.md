# PROGRESS — DeskMail AI build log

> **Claude Code: this file is the single source of truth for "where we are".**
> - Read it first at the start of every session (then `git log` + run the app/tests to confirm).
> - Update it at the end of every stage: tick the stage, note what was done, list TODOs/known
>   issues, and record the exact next step.
> - Keep it accurate — trust it over memory.

---

## Current status
- **Active stage:** **Backlog batch — building Plans 3, 4, 1 (in that order).**
- **Last session ended:** 2026-07-10 — mid-batch. Plan 3 (keyboard shortcuts) in progress.
- **Where things stand:** unit + E2E green after each committed stage; clean typecheck. See the
  **Backlog batch** log at the bottom of this file for the live per-stage state and next step.

### Backlog batch progress (Plans 3 → 4 → 1)
- **Plan 3 — Keyboard shortcuts** (customisable):
  - [x] 3.1 shared model + pure dispatch + unit test (`src/shared/shortcuts.ts`).
  - [x] 3.2 persistence (app_settings + IPC `shortcuts:get/set-enabled/set-map`), `mailStore`
    `selectNext/selectPrev`, `installShortcuts`, `App` wiring, `ShortcutHelp` cheat-sheet. E2E: j/k
    nav + Enter opens; `/` focuses search; `?` opens help; typing in search doesn't navigate.
  - [x] 3.3 Settings → Shortcuts pane (master toggle + per-action rebind/clear/reset, reserved-key
    refusal, duplicate warning). E2E: rebind Archive→'a' (old key inert), master-off disables all.
  - **Plan 3 DONE.** 4 shortcuts E2E green; typecheck clean.
- **Plan 4 — Default mail app (mailto)** — not started. ← **next**
- **Plan 1 — Full mail sync** — not started.

### Post-build features (requested after the 12 stages)
- **App icon + title-bar logo** — `icon/icon.png` → electron-builder icon + the top-left logo.
- **Mail actions with IMAP write-back** — migration **v4** `mail_actions` queue: `applyAction` mutates the
  local cache and queues the IMAP op; a background **drainer** pushes move/flag/read/trash/junk/archive to
  the server. Wired the reading-pane + message-window toolbars (archive/delete=Trash/star/mark-unread).
- **Auto junk filter** — conservative `classifyJunk`; obvious spam auto-moves to Junk on sync/seed;
  Settings → Security toggle + "Not junk". Delete is always **to Trash** (reversible); no permanent delete.
- **Claude email management (MCP)** — `move_email`, `archive_email`, `delete_email` (Trash), `flag_email`,
  `mark_email_read` (all reversible, queued → app drains to IMAP). Still **no** send/permanent-delete/
  credential tools. Tool surface is now 15.
- **Attachments + NotebookLM** — download attachments from IMAP + open with the OS app; `export_for_notebooklm`
  MCP tool + reading-pane **NotebookLM** button write the email (+ downloaded attachments) to a
  `notebooklm-export/…` folder for the **notebooklm skill** to add as sources.
- **Drafts view** (from Stage 11) surfaces Claude-created drafts.

### Environment gotcha (read on a fresh machine / after `rm -rf node_modules`)
The `electron` npm postinstall did **not** extract the binary automatically here — `npm install`
left `node_modules/electron/dist` empty (only LICENSES). Fix: the zip caches fine at
`%LOCALAPPDATA%\electron\Cache\<hash>\electron-v33.4.11-win32-x64.zip`; extract it into
`node_modules/electron/dist` and write `node_modules/electron/path.txt` containing `electron.exe`.
E2E (`npm run test:e2e`) fails with "Electron failed to install correctly" until this is done.

---

## Implementation plan

### Stack (chosen defaults — all current, all mainstream)
- **Runtime/build:** Electron + **electron-vite** (Vite + React + TS + HMR; builds main/preload/renderer cleanly). **electron-builder** for packaging (NSIS installer + portable target), per brief §9.
- **UI:** React 18 + TypeScript (strict) + **Tailwind CSS**. Design tokens from the Style Guide wired as CSS variables; Tailwind `theme.extend` maps to those vars so `bg-panel`, `text-2`, `accent`, `claude` etc. resolve to the right value per theme. Fonts (Hanken Grotesk, JetBrains Mono) bundled locally, not from Google CDN.
- **State:** **Zustand** — two separate stores: `layoutStore` (UI/layout) and `mailStore` (email data), per architecture rule. Layout prefs persist to SQLite.
- **DB:** ~~better-sqlite3~~ → **node-sqlite3-wasm** (Stage 4). This Windows box has **no MSVC compiler
  and no Node-24 prebuild**, so better-sqlite3 can't build. node-sqlite3-wasm is real on-disk SQLite
  compiled to WASM: synchronous better-sqlite3-like API (`exec/run/get/all/prepare`), durable file
  persistence, **no native compilation**, and works identically in Node (tests) and Electron (pure
  JS+WASM, ABI-independent). Hand-rolled version-based **migration runner** (`user_version` pragma).
  Note for Stage 10: unpack its `.wasm` from the asar when packaging.
- **Mail:** **imapflow** (IMAP), **nodemailer** (SMTP), **mailparser** (parsing). POP3 optional after IMAP works.
- **HTML sanitising:** **DOMPurify** (in main or a sandboxed context) + strip/relocate remote images to a blocked state; render sanitised HTML in a sandboxed `<iframe sandbox>` with no allow-scripts.
- **Secure credentials:** Electron **safeStorage** (DPAPI-backed on Windows); ciphertext stored in a `credentials` file/table, never plaintext. keytar only if safeStorage proves insufficient.
- **MCP:** **@modelcontextprotocol/sdk** — local stdio server in `/mcp`, read/draft-only tools (§6).
- **Tests:** **Vitest** (unit) + **Playwright for Electron** (E2E). Integration: mocked transports / local test SMTP.

### Folder structure
```
src/
  main/        Electron main: window mgmt, IPC handlers, sync service, DB access
  preload/     contextBridge typed IPC bridges (main window + message window)
  renderer/    React app (UI only) — components, stores, layouts, screens
  shared/      shared TS types (IPC payloads, DB rows, layout prefs)
  db/          schema, migrations, better-sqlite3 wrapper, queries
  mcp/         local MCP server + tool handlers
tests/         unit + e2e
electron.vite.config.ts, electron-builder.yml, tailwind.config.ts
```

### Key decisions / conventions
- Renderer has **zero Node access** (`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`); all system work via typed IPC.
- **Light theme default**; one-click toggle top-right of the command bar; theme persists in `layout_preferences`.
- Message windows are separate `BrowserWindow`s loaded by message ID, own preload, no Node.
- Git initialised in this folder; **one commit per stage** (brief §2.3), stage-gate before proceeding.
- Package manager: **npm** (brief wires `npm test` / `npm run test:e2e`).
- Copy/empty-states/errors in **Jamie's voice** (first person, British English, honest, no hype).
- **Compose editor:** rich text from the start (Stage 6) — TipTap, emits sanitised HTML.

### Stage list = the 12 stages below (from brief §5). Build one at a time, stage-gate after each.

---

## Stage checklist
Tick only when the stage's tests pass AND the app builds + launches. Then ask the user before moving on.

- [x] **Stage 1** — Scaffold & shell (secure window, title/command bars, light default + Light/Dark toggle, tokens)
- [x] **Stage 2** — Layout system + 6 presets + View Settings + persistence
- [x] **Stage 3** — Full independent message windows (double-click, by ID)
- [x] **Stage 4** — SQLite + migrations + account wizard + secure credentials + connection tests
- [x] **Stage 5** — Sync + parsing + offline cache + safe rendering (sanitise, block remote images)
- [x] **Stage 6** — Search + Compose + Drafts + manual Send + signature insertion
- [x] **Stage 7** — Calendar + invites + meeting providers
- [x] **Stage 8** — Added features: per-account signatures · send-later/undo-send · snooze · templates · contacts · Today agenda
- [x] **Stage 9** — Local MCP server (safe tools; Claude Desktop connector config)
- [x] **Stage 10** — Packaging (installer) + local backup + USB/portable mode
- [x] **Stage 11** — Hardening + error/empty/loading states + docs
- [x] **Stage 12** — Final review (verify every feature/security item/MCP tool; fix gaps)

---

## Per-stage notes
### Stage 1
- Done:
  - electron-vite project: `src/{main,preload,renderer,shared}`, strict TS (two tsconfigs), Tailwind
    v3 with tokens wired to CSS vars (light default, dark via `[data-theme]`), fonts bundled via
    `@fontsource` (no CDN at runtime).
  - Secure window: `frame:false`, `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`;
    typed preload bridge (`window.deskmail`) — settings get/set-theme + window controls only.
  - Renderer shell matching the prototype: 38px title bar (logo, File/View/Help dropdown menus,
    min/max/close), 56px command bar (Mail/Calendar tabs, Classic preset button, search w/ Ctrl+K,
    Compose, Claude, view-settings, one-click Light/Dark toggle top-right). Empty workspace in Jamie's voice.
  - Theme persists via `settings.json` in userData (IPC). `DESKMAIL_USER_DATA` env override added
    (isolates E2E; seeds Stage 10 portable mode).
- Tests: `npm test` → 4 unit (settings round-trip/defaults/corrupt/partial) green. `npm run test:e2e`
  → 1 Playwright-electron test green: boots, `window.require`/`window.process` undefined,
  `window.deskmail` present, light default, toggle→dark persists across relaunch. `npm run build` clean.
- Known issues / TODO:
  - Electron binary extraction gotcha (see Current status).
  - Cosmetic warning: `postcss.config.js` reparsed as ESM (no `type:module` on package.json — left off
    deliberately so electron-vite's CJS main output keeps working). Harmless.
  - Title-bar File/View/Help menu items are mostly placeholders — wired as their features land.
  - `npm audit` shows vulns in dev-only transitive deps (electron-vite chain); not shipped. Revisit at packaging.
- Next step: Stage 2 (layout system + 6 presets + View Settings + persistence).

### Stage 2
- Done:
  - `src/shared/layout.ts` — framework-free layout model: `LayoutPreferences` (all persisted fields),
    `PRESETS` map, `applyPreset`/`setPref`/`matchPreset`, and pure `computeArrangement(prefs)` that both
    the renderer and tests consume. Values mirror the prototype (sidebar widths 0/64/204/252, density
    paddings, list basis 320/376, reading 46% bottom, etc.).
  - Persistence generalised: settings.json now holds the whole `LayoutPreferences` (theme included).
    IPC is `settings:get` / `settings:save`; preload exposes `getSettings`/`saveSettings`.
  - **Zustand** `layoutStore` (UI/layout state) + `mailStore` (selection) — kept separate per the
    architecture rule. Store hydrates on launch, applies `data-theme`, persists every change.
  - Region components with mock data: `Sidebar` (accounts/folders/custom views, icons-only aware),
    `MessageList` (density + preview-line clamp + avatars/plain + labels/star/attach), `ReadingPane`
    (toolbar, remote-image block banner, body, attachments, Open-in-window + Ask-Claude), `ClaudePanel`
    (docked inline / slide-over left|right / floating), `Workspace` (arranges all from the arrangement).
  - `ViewSettings` modal: six preset cards with schematics + fine-tune segmented controls
    (reading pane, sidebar mode/side, density, list style, Claude panel, opening behaviour) + preview
    slider. Command-bar preset button shows the live preset label and opens View Settings.
  - Retired the Stage-1 `theme.tsx` provider (store owns theme now).
- Tests: `npm test` → 11 unit (7 layout: each preset→arrangement, matchPreset/setPref round-trip,
  density/preview; 4 settings). `npm run test:e2e` → 2 Playwright-electron (boot+security+theme
  persist; **preset selection persists across relaunch**). Typecheck + build clean.
- Known issues / TODO:
  - `onOpen` (double-click / Open-in-window) is threaded through but currently a no-op — wired in Stage 3.
  - Claude panel content is static mock; transcript/tools arrive with the MCP work (Stage 9).
  - Calendar tab is a placeholder (Stage 7). Search input is inert (Stage 6).
  - E2E temp-dir cleanup is best-effort (`safeRm`) due to a Windows userData lock after close.
- Next step: Stage 3 (independent message windows).

### Stage 3
- Done:
  - Second renderer entry `message.html` + `message-main.tsx` (electron-vite multi-input). Independent
    windows load it by URL query `?id=`, apply the persisted theme, render `MessageWindow`.
  - Main process: `openMessageWindow(id)` creates a frameless window with the shared `securePrefs()`
    (contextIsolation, sandbox, no nodeIntegration, own preload). Windows tracked in a `Map<id,win>` —
    re-opening the same id focuses the existing window; each removed from the map on close.
    Refactored the main window to use `securePrefs()` too. New IPC `message-window:open`; window
    controls already operate on the sending window so message windows close independently.
  - `MessageWindow` UI: chrome (subject + min/max/close), full action toolbar (Reply · Reply all ·
    Forward · Archive · Delete · Star · Mark unread · Print · Close), Claude actions bar (7 chips),
    body with sender/recipient/date/attachments. `data-testid` hooks on rows + window for tests.
  - Wired `onOpen` through App → Workspace → MessageList/ReadingPane to `window.deskmail.openMessage`.
    `openEmailBehaviour`: double-click always opens a window; single-click opens one when set to
    "full window", otherwise just selects into the reading pane.
- Tests: `npm test` → 11 unit (unchanged). `npm run test:e2e` → 5 Playwright-electron (2 prior + 3 new:
  double-click opens isolated window by id with no Node; multiple windows coexist + close
  independently; re-open focuses existing, no duplicate). Typecheck + build clean; both HTML entries
  emitted to out/renderer.
- Known issues / TODO:
  - Message windows read from mock data (same as the list) — swaps to the SQLite store in Stage 5.
  - Toolbar + Claude actions are visual only (no behaviour yet); Claude actions light up in Stage 9.
  - No live theme sync to already-open message windows if theme changes in the main window (they read
    theme at open). Fine for now; revisit if it matters.
- Next step: Stage 4 (SQLite + account wizard + secure credentials).

### Stage 4
- Done:
  - **DB driver pivot:** better-sqlite3 won't build here (no MSVC, no Node-24 prebuild) → switched to
    **node-sqlite3-wasm** (real on-disk SQLite via WASM, synchronous better-sqlite3-like API, no native
    build, works in Node + Electron). Verified opening/persisting in both the Electron runtime and Node.
  - `src/db/`: version-based **migration runner** (`user_version`, per-migration transaction) + v1 schema
    for **every** FEATURE_SPEC table + additions + a `credentials` table. `openDatabase()` sets
    `foreign_keys=ON` and migrates. `accounts.ts` (list/insert with colour), `settings.ts` (single-row
    `layout_preferences` <-> LayoutPreferences mapper + one-time import from the legacy settings.json).
  - Settings persistence moved from settings.json to the DB: `settings:get/save` now read/write
    `layout_preferences`; on first run the old JSON is imported (`seedLayoutIfEmpty`).
  - **Secure credentials** (`src/main/credentials.ts`): Electron `safeStorage` (DPAPI) encrypts the
    password; only ciphertext goes in the `credentials` table — plaintext never on disk.
  - **Connection testing** (`src/main/mail/connectionTest.ts`): imapflow (incoming IMAP), nodemailer
    (`verify`, outgoing SMTP), basic TCP/TLS reachability for POP3. Pure `classifyImapError` /
    `classifySmtpError` map failures to the FEATURE_SPEC states (auth / server).
  - IPC + bridge: `account:list/test-incoming/test-outgoing/save`. electron-vite `externalizeDepsPlugin`
    added so node-sqlite3-wasm/imapflow/nodemailer load from node_modules at runtime.
  - **UI:** Settings modal (left nav: Accounts + placeholders for the rest) + **Account wizard**
    (display name, email, IMAP/POP3, host/port/security segmented, SMTP, username/password; Test
    incoming/outgoing with the connection-state labels; Save → "Account added"). File → Settings wired.
- Tests: `npm test` → 20 unit (added 5 db migrations/round-trip, 4 connection-state classifiers).
  `npm run test:e2e` → 7 (added 2: wizard saves an account with the **password encrypted at rest**
  [asserted the plaintext is absent from the DB file] + persists across relaunch; unreachable server →
  "Server settings incorrect"). Typecheck + build clean.
- Known issues / TODO:
  - Mail list/reading/message-windows still read **mock data** — real sync + DB-backed mailStore is Stage 5.
  - POP3 test is reachability-only (full POP3 auth arrives with POP3 sync).
  - `src/main/settings.ts` (JSON) is now only used for the one-time legacy import; keep until confident.
  - Packaging note (Stage 10): unpack node-sqlite3-wasm's `.wasm` from the asar.
- Next step: Stage 5 (sync + parsing + safe rendering).

### Stage 5
- Done:
  - **DB stores:** `src/db/folders.ts` (upsert by remote_path, refresh counts, list) and `messages.ts`
    (idempotent upsert by account+folder+uid, list by folder, get detail w/ attachments, mark read).
  - **Parse + ingest** (`src/main/mail/ingest.ts`): mailparser `simpleParser` → MessageInsert +
    attachment metadata. Pure over the DB, so unit-tested without a network (this is the offline write path).
  - **Safe rendering:** `src/renderer/mail/sanitise.ts` (DOMPurify) strips scripts/handlers/iframes/forms
    and, by default, removes remote `<img src>`/`srcset` + remote `url()` backgrounds, flagging when it
    blocked something. `EmailBody.tsx` renders the sanitised HTML in a `sandbox="allow-same-origin"`
    (no-scripts) iframe on a white card, auto-sized to content, with a "Load images" opt-in banner.
    CSP relaxed to `img-src 'self' data: https:` (default-block enforced by the sanitiser, not CSP).
  - **IMAP sync** (`sync.ts` + reuse of imapflow): list folders → upsert; fetch recent 50 from INBOX →
    ingest with \Seen/\Flagged flags; record sync_state. `syncAccount`/`syncAllAccounts`; runs on launch
    and after account save (non-blocking); `mail:sync` IPC; `mail:changed` broadcast → renderer refetch.
  - **Renderer swap to DB-backed data:** rewrote `mailStore` (accounts/folders/messages/selected via IPC,
    marks read on open, subscribes to `mail:changed`); Sidebar/MessageList/ReadingPane/MessageWindow now
    read the store (deleted the mock data module). Friendly empty states when there's no account/mail.
  - **Env-gated demo seed** (`DESKMAIL_SEED_DEMO=1`, `demoSeed.ts`): 6 emails incl. one with a tracking
    pixel + `<script>` — lets the app/E2E show a populated mailbox without a live IMAP account.
- Tests: `npm test` → 29 unit (+3 parse/offline ingest, +6 sanitiser [scripts stripped, remote images
  blocked/allowed, data: kept, bg url neutralised]). `npm run test:e2e` → 9 (+2 mail: sanitised body
  renders with tracker+script neutralised and `__pwned` never set, remote-image block+Load-images,
  offline read from cache after relaunch with no reseed). jsdom added for the sanitiser test env.
- Known issues / TODO:
  - Sync pulls INBOX only (recent 50) — extend to more folders if wanted. POP3 sync still not implemented.
  - Attachments store metadata only; content is fetched to disk when opened (open flow is a later stage).
  - Reading-pane/full-window toolbar buttons still visual (reply/archive/etc. wired in Stage 6+).
  - Email body iframe links are inert (safe); external-open bridge can come later.
  - Search box + Compose are still inert — Stage 6.
- Next step: Stage 6 (search + compose + drafts + sending).

### Stage 6
- Done:
  - **Search:** `searchMessages(db, query)` — LIKE across subject/from/snippet/body_text, AND over terms,
    case-insensitive (ponytail: swap for FTS5 if slow). `mail:search` IPC; command-bar search input is
    controlled by the mail store (`runSearch`) → results into the list with a "Search: …" header and a
    search-specific empty state; clearing returns to the folder.
  - **Drafts + send backend:** `src/db/drafts.ts` (save/update/list/get/delete), `signatures.ts`
    (`getDefaultSignature` + `ensureDefaultSignature` — first-person default seeded on account create and
    for the demo account). `src/main/mail/send.ts`: pure `buildMail(payload, signature)` (recipients,
    subject, body, HTML-escaped appended signature, attachments) + `sendMail` via nodemailer SMTP.
  - **Compose UI** (`compose/Compose.tsx`): bottom-anchored modal — From selector (accounts), To +
    Cc/Bcc toggle, Subject, **Claude rewrite bar** (chips present; transform deferred to the connector),
    **TipTap** rich body → HTML, signature preview, attachments via native file dialog, Save draft, Send.
    Wired to the command-bar Compose button and File → New email.
  - IPC/bridge: `compose:get-signature/save-draft/list-drafts/get-draft/delete-draft/pick-attachments/send`.
    **Send is a manual action only** — `compose:send` is the sole send path, reached only from the Send button.
- Tests: `npm test` → 40 unit (+5 search, +6 compose: buildMail mapping/signature/escaping, draft
  persist/update, default-signature once). `npm run test:e2e` → 12 (+3: search filters + clears; draft
  persists across relaunch; **send only on click** — bad SMTP surfaces an error and never auto-sends).
- Known issues / TODO:
  - Claude **rewrite** chips are visual placeholders (need an LLM call, not in scope until the connector).
  - Reply/Reply-all/Forward toolbar buttons don't yet prefill Compose (compose-new works; reply context later).
  - Sent mail isn't appended to the IMAP Sent folder yet (SMTP send only). Drafts don't persist attachments.
  - No Drafts list UI yet (drafts persist + are queryable; a browse/reopen view can come later).
- Next step: Stage 7 (calendar + invites + meeting providers).

### Stage 7
- Done:
  - `shared/meetings.ts` — providers (Teams/Meet/Zoom/in-person/custom) with colours, `generateJoinLink`
    (format-correct placeholder links; custom uses the pasted URL), `providerFromText`.
  - `db/events.ts` — event CRUD + attendees; video providers auto-get a join link. `listEvents(from,to)`
    for the month. Migration **v2**: `messages.invite_json`.
  - `main/mail/ics.ts` — minimal RFC-5545 parser (unfold, VEVENT, SUMMARY/DTSTART/DTEND/LOCATION/URL/
    ORGANIZER/ATTENDEE; literal HH:MM). Ingest detects a text/calendar part or .ics attachment → stores
    parsed invite JSON on the message; `MessageDetail.invite`.
  - `main/meetings.ts` — `appUriFor` (Teams `msteams:` / Zoom `zoommtg:` deep links; others browser) +
    `joinMeeting` (respects the launch-desktop-app app_setting, browser fallback via shell.openExternal).
  - IPC/bridge: `calendar:list-events/create/update/delete/join/accept-invite`. accept-invite builds an
    event from the message's parsed invite.
  - **UI:** `calendarStore` + `Calendar` (sidebar with New event + Upcoming; month grid, Monday-first,
    today highlight, colour-coded events, click a day to add); `EventModal` (title, native date/time,
    provider picker with join note / custom link field, guests, notes); `InviteCard` in the reading pane
    + full window (Accept/Tentative/Decline; **Accept adds the event**). Command-bar primary button is
    Compose in mail, New event in calendar. Demo seed gained an ICS invite email.
- Tests: `npm test` → 49 unit (+9: events CRUD, link generation, deep-link derivation, provider detect,
  ICS parse). `npm run test:e2e` → 14 (+2: create event shows in the grid; **accept invite → event in the
  calendar**). Adjusted db user_version (→2) and the demo row count (→7) after the migration/seed changes.
- Known issues / TODO:
  - Week/Day views are labels only (Month works). No event edit/delete UI yet (CRUD exists in the DB/IPC).
  - ICS times are taken literally (no timezone conversion). Real per-provider meetings use placeholder links.
  - `join` launches via shell.openExternal (not E2E-tested to avoid opening real apps); pure parts are unit-tested.
- Next step: Stage 8 (added power features).

### Stage 8
- Done (all six added features):
  1. **Signatures** — migration **v3** `signatures.append_to_new`; `getSignatureData`/`updateSignature`;
     `getDefaultSignature` returns the body only when append is on. Settings → Signatures pane (per-account
     select, body editor, append toggle, live). Compose shows the preview only when append is on.
  2. **Send-later & undo-send** — `db/scheduledSends.ts` (schedule/list/due/cancel/markSent/markError) =
     a stored draft + scheduled_sends row. Main **background sender** polls every 5s and delivers due
     sends. Compose Send → `sendWithUndo` (queues ~10s out) + an **Undo** toast; **Send later** → native
     datetime → `scheduleSend`. Settings → Sending lists + cancels scheduled sends.
  3. **Snooze** — `db/snoozes.ts` (`computeSnoozeTime` quick options, `snoozeMessage`, `isSnoozed`);
     `listMessages` excludes currently-snoozed messages (they reappear when due). Reading-pane snooze menu.
  4. **Templates** — `db/templates.ts` (CRUD + `seedTemplatesIfEmpty`, 3 canned replies in Jamie's voice);
     seeded on first run. Compose "Templates" control inserts into the editor; Settings → Templates manages them.
  5. **Contacts** — `db/contacts.ts` (upsert/list/search); auto-collected from senders during ingest;
     Compose To field autocompletes via a `<datalist>`; Settings → Contacts browses them.
  6. **Today agenda** — `db/today.ts` (`getTodayAgenda`: today's events + unread, non-snoozed mail);
     new **Today** command-bar tab + view; messages open in a full window, events offer Join.
  - Added a small `toastStore` + `Toast` for undo/confirmations.
- Tests: `npm test` → 55 unit (+6 features covering each core path). `npm run test:e2e` → 18 (+4: template
  insert, snooze hides a row, Today lists unread, signature save persists; and the compose send/draft
  tests updated to the undo-send model). Adjusted db user_version → 3.
- Known issues / TODO:
  - Undo-send delay is a fixed 10s constant (app_settings hook exists; expose in Settings later).
  - Scheduled sends don't carry attachments (drafts don't persist them). Delivery failures mark 'error' (no retry UI).
  - Contacts autocomplete is a native datalist (no rich dropdown); no manual contact add/edit yet.
  - Meetings/Claude connector/Appearance/Security/Local storage settings panes are still placeholders (Stages 9–11).
- Next step: Stage 9 (local MCP server).

### Stage 9
- Done:
  - `src/mcp/tools.ts` — `buildTools(db)` returns exactly the **9 safe read/draft tools** (per
    FEATURE_SPEC §MCP), each a `{name, description, inputSchema (zod), handler}` kept independent of the
    SDK so it's directly unit-testable. Handlers reuse the db layer + `searchEmails(db, opts)` (new
    filtered search). `create_draft` writes a draft with `created_by='claude'`. extract/summarise are
    heuristic **data providers** (regex dates/deadlines, extractive key points/questions) — the actual
    reasoning is Claude's. No send/delete/credential/settings/filesystem tool exists.
  - `src/mcp/server.ts` — standalone stdio MCP server (@modelcontextprotocol/sdk `McpServer`), DB path
    from `DESKMAIL_DB` (else the platform userData default). Built as a second main input →
    `out/main/mcp-server.js`. **Verified end-to-end**: an MCP `Client` over stdio listed exactly the 9
    tools and calls returned correct data.
  - **Settings → Claude connector** pane: read-&-draft-only status, the tool list, and a ready-to-paste
    `claude_desktop_config.json` (launches the server via DeskMail's binary with `ELECTRON_RUN_AS_NODE=1`
    + `DESKMAIL_DB`) with a Copy button. README gained a "Connecting Claude Desktop" section + dev run steps.
- Tests: `npm test` → 65 unit (+10 MCP: exact 9-tool surface with no send/delete/credential names; every
  tool's output shape; create_draft stored as claude-authored). `npm run test:e2e` → 18 (unchanged).
  Plus a manual client↔server stdio smoke that confirmed the real bundle works.
- Known issues / TODO:
  - Claude-created drafts persist (created_by='claude') but there's no **Drafts list UI** yet to view
    them in-app — add a Drafts view (Stage 11) so create_draft is visibly surfaced.
  - extract/summarise are heuristic; fine as data for Claude, not a replacement for its reasoning.
  - Packaging must unpack the `.wasm` + keep mcp-server/deps outside the asar (Stage 10).
- Next step: Stage 10 (packaging + backup + portability).

### Stage 10
- Done:
  - **Portable/USB mode:** `src/main/dataDir.ts` `resolveDataDir` — precedence: `DESKMAIL_USER_DATA` →
    `--portable [dir]` → a `portable.txt`/`data/` marker next to the exe → OS default. Wired before app
    ready so userData points at the portable folder; Settings shows the data dir + a "Portable mode" badge.
  - **Backup/restore:** `src/main/backup.ts` `backupTo`/`restoreFrom` (pure fs) copy DB + attachments +
    settings into/out of a self-contained `deskmail-backup-<timestamp>/` folder. `storage:backup/restore/
    info` IPC (accept an explicit path or show a native folder picker); restore closes + reopens the DB
    and refreshes the UI. Settings → Local storage pane (Back up now / Restore + data-location card).
  - **electron-builder:** `electron-builder.yml` — NSIS installer + portable target, no signing/licence UI,
    **`asar: false`** so node-sqlite3-wasm's `.wasm` and the standalone MCP server's deps load as plain
    files. `npm run package`. **Built + delivered:** `release/DeskMail AI-0.1.0-setup.exe` (85 MB) and
    `release/DeskMail AI-0.1.0-portable.exe` (84 MB).
  - **Verified the packaged build runs:** launched `release/win-unpacked/DeskMail AI.exe` → app boots,
    DB works (demo account, 7 rows). And the **packaged MCP server** works via the connector path
    (app binary + `ELECTRON_RUN_AS_NODE=1` + `DESKMAIL_DB`): listed all 9 tools, returned correct data,
    `.wasm` loaded from unpacked resources.
- Tests: `npm test` → 72 unit (+7: resolveDataDir precedence, backup/restore round-trip). `npm run
  test:e2e` → 20 (+2: portable mode writes the given dir; back up + restore round-trips and undoes a snooze).
- Known issues / TODO:
  - `asar: false` → larger install (bundles all prod node_modules incl. some renderer-only deps). Fine
    for personal use; could switch to asar + asarUnpack later to slim it.
  - No app icon set (default Electron icon). Add a Functional 3D UK icon if wanted.
  - `release/` is gitignored (binaries not committed) — the installers live on disk at the paths above.
- Next step: Stage 11 (hardening + error/empty/loading states + Drafts view + docs).

### Stage 11
- Done:
  - **Drafts view (closes the Stage 9 gap):** `DraftsModal` lists local drafts — including any Claude
    wrote via the connector (badge on `created_by='claude'`); Edit opens Compose **prefilled** (Compose
    now accepts a `draft` and updates it via `draftId`); Delete works. Sidebar "Drafts" entry with a live
    count; the server-side `role='drafts'` folder is hidden so there's a single, unambiguous Drafts view.
  - **Hardening:** `hardenWindow()` on every window — external links → browser, in-app navigation blocked
    (`will-navigate`), webviews refused (`will-attach-webview`), plus the existing window-open handler.
    Renderer **`ErrorBoundary`** (friendly reload panel in Jamie's voice) wraps the main and message windows.
  - **States review:** loading/empty states confirmed across list, reading pane, message window, Today,
    Calendar, Drafts, Settings panes; connection tests and sending already surface friendly outcomes.
  - **Docs:** new `DEVELOPMENT.md` (stack rationale, folder layout, run/test/package, architecture rules,
    **security model**). README already has connector + dev-run sections.
- Tests: `npm test` → 72 unit (unchanged). `npm run test:e2e` → 21 (+1: a Claude-authored draft appears
  in the Drafts view and opens prefilled in Compose). Typecheck + build clean.
- Known issues / TODO:
  - Sidebar draft count refreshes on `mail:changed`/mount; a draft Claude adds shows immediately when the
    Drafts view is opened (it always refetches), but the sidebar number may lag until the next refresh.
  - No app icon yet (default Electron icon).
- Next step: Stage 12 (final review + checklist).

### Stage 12 — Final review
- Re-read the brief + FEATURE_SPEC and walked the §8 checklist (now ticked above with evidence).
- Verification run: `rm -rf out && npm run build` clean; `npm run typecheck` clean; `npm test` → 72 unit;
  `npm run test:e2e` → 21 E2E; launch smoke → **0 console errors** exercising mail/reading/theme/Claude panel.
- Packaged artefacts confirmed runnable earlier (Stage 10): app + MCP server both work from the build.
- **One deferral** recorded (custom smart-view builder — a FEATURE_SPEC item outside the §11 Definition of
  Done); everything in the Definition of Done is present and working. No blocking gaps.
- **Verdict: DONE.** DeskMail AI meets the Definition of Done (§11): add IMAP/SMTP account, sync + read
  offline, configurable layouts, independent message windows, search, compose/draft, manual send, calendar
  + meetings, and the safe Claude MCP connector — Style-Guide styling, tests green, installer built, backup
  + USB portability working.

_(Build complete. Future work would append new stages here.)_

---

## Final review checklist (Stage 12 — VERIFIED)
- [x] **Every MVP feature present and working** — account setup + secure creds, IMAP sync, offline read,
  layouts, full message windows, search, compose/draft, manual send, calendar + meetings, MCP connector
  (all in the §11 Definition of Done). *Deferral: the FEATURE_SPEC "custom smart-view builder" is the one
  spec item not built — see Deferrals below.*
- [x] **All six layout presets + persistence** — `shared/layout.ts` PRESETS (classic/bottom/focus/wide/
  right/noreading); `layout.test.ts` asserts each → arrangement; `app.spec.ts` proves persistence across relaunch.
- [x] **Full independent message windows** — separate `BrowserWindow` by id, own preload, no Node;
  `message-window.spec.ts` (isolated open, coexist + independent close, no duplicate).
- [x] **Calendar + invites + meeting providers** — month view, event CRUD, Teams/Meet/Zoom/in-person/
  custom, join-link + deep-link launch; ICS invite → card → **Accept adds the event** (`calendar.test.ts`,
  `calendar.spec.ts`).
- [x] **All six added features** — signatures (append toggle), send-later & undo-send, snooze, templates,
  contacts, Today agenda (`features.test.ts` one per feature; `features.spec.ts` E2E).
- [x] **All MCP tools present; forbidden actions impossible** — exactly the 9 tools, no send/delete/
  credential tool exists (`mcp.test.ts`); live stdio client↔server verified in dev **and packaged**.
- [x] **Security requirements all met** — sanitise (DOMPurify) + sandbox iframe; remote images blocked by
  default; no Node in renderer (asserted); creds encrypted at rest (asserted plaintext absent from DB);
  attachments never auto-open; **send is manual only** (undo-window queue, no auto path); `hardenWindow`
  blocks navigation/webviews; strict CSP.
- [x] **Installer builds; backup/restore + portable mode verified** — `release/DeskMail AI-0.1.0-setup.exe`
  + `-portable.exe` built; **packaged app + packaged MCP server both run**; backup/restore + portable-dir
  round-trip (`packaging.test.ts`, `storage.spec.ts`).
- [x] **Light default + easy Light/Dark toggle; styling matches the Style Guide; copy in Jamie's voice** —
  tokens copied verbatim from the Style Guide; one-click toggle top-right; empty/error copy first-person British.
- [x] **`npm test` + `npm run test:e2e` green; app builds and launches clean** — **72 unit + 21 E2E green**;
  clean `rm -rf out && npm run build` + typecheck pass; **zero console errors** on launch (verified).

### Deferrals (documented, not blocking the Definition of Done)
- **Custom smart-view builder** (FEATURE_SPEC §Custom view builder): a match-all/any condition builder +
  saved smart views. It's in FEATURE_SPEC but **not** in the §11 Definition of Done or any staged
  deliverable, so it was not built. Easy future add on top of `searchEmails`. *(Say the word and I'll build it.)*
- **Placeholder Settings panes**: Folders, Sync, Appearance, Security, Privacy, About are stubs (the
  functional ones — Accounts, Signatures, Templates, Contacts, Sending, Claude connector, Local storage —
  all work; theme lives in the command bar; layout in View Settings).
- **POP3 sync** not implemented (IMAP done; POP3 was "optional after IMAP" — wizard tests reachability only).
- **Claude compose "rewrite" chips** are placeholders (they'd need an app→LLM call, outside the safe MCP model).
- Undo-send delay is a fixed 10s; scheduled sends don't carry attachments; no custom app icon.
