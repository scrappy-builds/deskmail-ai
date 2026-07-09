# PROGRESS — DeskMail AI build log

> **Claude Code: this file is the single source of truth for "where we are".**
> - Read it first at the start of every session (then `git log` + run the app/tests to confirm).
> - Update it at the end of every stage: tick the stage, note what was done, list TODOs/known
>   issues, and record the exact next step.
> - Keep it accurate — trust it over memory.

---

## Current status
- **Active stage:** Stage 6 complete (awaiting go-ahead for Stage 7).
- **Last session ended:** 2026-07-09 — Stage 6 built, tested, committed.
- **Exact next step:** On user's OK, start **Stage 7 — Calendar & meetings**: month view, events in the
  `events` table, New Event modal, meeting-provider selection (Teams / Google Meet / Zoom / in-person /
  custom link) that generates a join link and launches the installed desktop app (fallback to browser);
  email invites parse to an invite card, Accept adds the event to the calendar. Wire the Calendar tab +
  "New event" primary button (already switches label in the command bar). Tests: event CRUD; invite →
  event; provider link/launch.

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
- [ ] **Stage 7** — Calendar + invites + meeting providers
- [ ] **Stage 8** — Added features: per-account signatures · send-later/undo-send · snooze · templates · contacts · Today agenda
- [ ] **Stage 9** — Local MCP server (safe tools; Claude Desktop connector config)
- [ ] **Stage 10** — Packaging (installer) + local backup + USB/portable mode
- [ ] **Stage 11** — Hardening + error/empty/loading states + docs
- [ ] **Stage 12** — Final review (verify every feature/security item/MCP tool; fix gaps)

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

_(Add a block like the above for each stage as you go.)_

---

## Final review checklist (complete in Stage 12)
- [ ] Every MVP feature present and working
- [ ] All six layout presets + persistence
- [ ] Full independent message windows
- [ ] Calendar + invites + meeting providers
- [ ] All six added features
- [ ] All MCP tools present; forbidden actions impossible
- [ ] Security requirements all met (sanitise, block remote images, secure creds, no Node in renderer, no auto-open, manual send)
- [ ] Installer builds; backup/restore + portable mode verified
- [ ] Light default + easy Light/Dark toggle; styling matches the Style Guide; copy in Jamie's voice
- [ ] `npm test` + `npm run test:e2e` green; app builds and launches clean
