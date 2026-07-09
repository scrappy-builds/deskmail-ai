# Build Brief for Claude Code — DeskMail AI

**Paste this whole file into Claude Code as your first message, with this folder as the working
directory. Read `README.md`, `FEATURE_SPEC.md`, `Functional3DUK_Brand_Guide.md`, and open the files
in `design-files/` before writing any code.**

---

## 0. Who this is for
This is a **personal, single-user** Windows desktop email client for one person (Jamie). Because it
is only ever used by its owner:
- **No** sign-up, onboarding accounts, licensing, EULA, or "terms" screens.
- **No** multi-user, roles, or telemetry/analytics.
- Optimise for one person's convenience, local control, and portability between their own PCs.

---

## 1. Mission
Build DeskMail AI as a production-quality **Electron + React + TypeScript + Tailwind CSS** desktop
app with a local **SQLite** store, IMAP/SMTP (and optional POP3) sync, OS-secure credential storage,
sanitised email rendering, a flexible layout system, and a **local MCP server** that lets Claude
Desktop safely search / read / summarise / draft (never send or delete without in-app approval).

Recreate the UI in `design-files/` **pixel-close** using the tokens in `Style Guide.dc.html`. The
HTML files are references — do not ship them; rebuild them properly in React + Tailwind.

---

## 2. HOW YOU MUST WORK  (read this twice)

This project is large and will span **many sessions over multiple days**. The user's session/usage
may run out at any time. You must be resilient to that.

**2.1 Plan first.** Before coding, produce a written implementation plan and save it. Confirm the
plan and the stage list with the user before starting Stage 1.

**2.2 Build in stages.** Implement **one stage at a time** (stages listed in §5). Within a stage,
work in small, verifiable increments.

**2.3 Stage gate.** At the **end of every stage**:
1. Run the stage's tests and a build; make sure it compiles and runs.
2. Update `PROGRESS.md` (tick the stage, note what was done, list any TODOs/known issues, and record
   the exact next step).
3. Commit with a clear message (`git commit -m "Stage N: <summary>"`).
4. **Stop and ask the user: "Stage N is complete and tested. Am I ready to continue to Stage N+1?"**
   Do **not** proceed until they say yes.

**2.4 Resume cleanly.** At the **start of every session**, read `PROGRESS.md` first, check
`git log`, run the app + tests to confirm the current state, then continue from the recorded next
step. `PROGRESS.md` is the single source of truth for "where we are" — keep it accurate and current;
treat it as more authoritative than your own memory.

**2.5 Test as you go.** Every stage must ship with tests appropriate to it (see §7). A stage is not
"complete" until its tests pass and the app builds and launches.

**2.6 Final review.** After the last stage, run a **full end-to-end review** (§8): re-read this brief
and `FEATURE_SPEC.md`, and verify every listed feature, security requirement, and MCP tool actually
exists and works. Produce a checklist in `PROGRESS.md` marking each item present/working, and fix
gaps before declaring done.

---

## 3. Architecture (non-negotiable)
- **Renderer** (React + TS + Tailwind) handles UI only. No Node APIs in the renderer.
- **Main process** owns all system access: DB, network (IMAP/POP3/SMTP), filesystem, secure store.
- **Preload + contextIsolation** with a typed, minimal IPC bridge (`contextBridge`). `nodeIntegration:
  false`, `contextIsolation: true`, `sandbox: true` where feasible.
- **Background sync service** runs in the main process (or a utility process), not the UI thread.
- **State separation:** keep **layout/UI state** separate from **email data state** (e.g. a layout
  store vs. a mail store). Layout preferences persist to SQLite (`layout_preferences`) / a settings
  table; email data lives in its own tables.
- **Strong typing** throughout. Shared types for IPC payloads and DB rows.
- Clean folder structure (`/main`, `/renderer`, `/preload`, `/shared`, `/mcp`, `/db`, `/tests`).

---

## 4. Data model
Implement these SQLite tables (columns per the original spec — see `FEATURE_SPEC.md §Data model`
for the full column lists and the additions):
`accounts, folders, messages, attachments, drafts, labels, message_labels, sync_state,
layout_preferences, app_settings` — **plus** the tables needed for the added features:
`signatures` (per-account), `scheduled_sends`, `snoozes`, `templates`, `contacts`, `events`,
`event_attendees`.

Use migrations so the schema can evolve across stages without data loss.

---

## 5. Stages (build in this order; stage-gate after each)

**Stage 1 — Scaffold & shell.** Electron + React + TS + Tailwind project. Secure window config
(contextIsolation, no nodeIntegration, preload bridge). App boots to an empty shell with the title
bar (File/View/Help menus + window controls) and command bar. Light theme default; working one-click
Light/Dark toggle in the top-right; design tokens wired as CSS variables / Tailwind theme.
*Tests:* app launches; window security flags asserted; theme toggle persists.

**Stage 2 — Layout system with mock data.** Sidebar / message list / reading pane / Claude panel
regions driven by typed layout state. All six presets (Classic, Bottom Preview, Focus Mode, Wide
Monitor, Right Sidebar, No Reading Pane) and the View Settings screen. Preferences persist and
restore on launch. *Tests:* each preset produces the expected arrangement; prefs round-trip.

**Stage 3 — Full message window.** Double-click opens a message in its own independent
BrowserWindow (own preload, no Node), loading by message ID; multiple windows coexist; full toolbar
+ Claude actions. *Tests:* window opens by ID, isolated, closes independently.

**Stage 4 — SQLite + account setup + secure credentials.** Schema + migrations. Account setup
wizard (IMAP/POP3 + SMTP fields, test-incoming / test-outgoing buttons with the connection-status
states). Credentials stored via OS secure storage (Electron `safeStorage` / keytar) — never plain
text. *Tests:* schema migrates; credentials encrypted at rest; connection-test states.

**Stage 5 — Sync + parsing + safe rendering.** IMAP folder + recent-message sync in the background
service; POP3 optional after IMAP works; parse and store messages/attachments; offline reading from
cache. Sanitise HTML, **block remote images by default** (with a "load images" affordance), no
script execution, attachments never auto-open. *Tests:* sanitiser strips scripts/blocks remote
images; offline read works; parser handles multipart + attachments.

**Stage 6 — Search, Compose, Drafts, Sending.** Local full-text search. Compose (from/to/cc/bcc/
subject/body, Claude rewrite hooks, attachments, **signature insertion**). Save drafts. **Send only
on explicit user action** via SMTP. *Tests:* search returns expected hits; draft persists; send is
never automatic.

**Stage 7 — Calendar & meetings.** Month view, events in SQLite, New Event modal, meeting-provider
selection (Teams / Google Meet / Zoom / in-person / custom link) that generates a join link and
launches the installed desktop app (fallback to browser). Email invites parse to an invite card;
**Accept adds the event to the calendar**. *Tests:* event CRUD; invite → event; provider link/launch.

**Stage 8 — Added power features** (see `FEATURE_SPEC.md` for exact behaviour):
per-account **signatures**; **send-later & undo-send**; **snooze / remind-me**; **canned reply
templates**; **contacts / address book**; unified **Today agenda** (unread mail + the day's events).
*Tests:* one test per feature covering its core path.

**Stage 9 — Local MCP server.** Local server exposing exactly the safe tools (§6). Read/draft only;
no send, no delete, no credential access, no settings changes, no filesystem access outside the
app's approved storage. Include Claude Desktop connector config + instructions in the app's Settings
and the README. *Tests:* each tool returns the specified shape; forbidden actions are impossible.

**Stage 10 — Packaging, backup & portability** (see §9). Windows installer, personal-use build,
local DB backup, and USB/portable mode. *Tests:* installer produces a runnable app; backup+restore
round-trips; portable mode reads/writes the portable data dir.

**Stage 11 — Hardening, error/empty/loading states, docs.** Security review, friendly error
messages, sensible loading + empty states everywhere, final README + developer docs.

**Stage 12 — Final review** (§8).

---

## 6. MCP tools (implement exactly; safe subset only)
`list_accounts`, `list_folders`, `search_emails`, `read_email`, `create_draft`,
`find_related_emails`, `find_unanswered_emails`, `extract_dates_and_deadlines`,
`summarise_thread_data`. Inputs/outputs are specified in `FEATURE_SPEC.md §MCP`.
**Claude must never** send, permanently delete, read credentials, change account settings, touch
files outside approved storage, or bypass user approval. Any destructive/external action is surfaced
in-app for explicit approval.

---

## 7. Testing strategy
- **Unit** (Vitest/Jest): sanitiser, parsers, layout-state reducers, search, MCP tool handlers,
  backup/restore, scheduling logic.
- **Integration**: IMAP/SMTP against a local test server (e.g. GreenMail/`smtp-tester`) or mocked
  transports; DB migrations.
- **E2E** (Playwright for Electron): launch app, add a mock account, sync, read, compose+draft,
  switch layouts, open a full window, calendar add, theme toggle.
- **Security assertions**: renderer has no Node access; remote images blocked; scripts stripped;
  credentials not in plain text; MCP cannot send/delete.
- Wire `npm test` and `npm run test:e2e`; a stage isn't done until its tests are green and the app
  builds + launches.

---

## 8. Final review checklist (Stage 12)
Re-read this brief + `FEATURE_SPEC.md`, then verify and tick in `PROGRESS.md`:
- [ ] Every MVP feature present and working
- [ ] All six layout presets + persistence
- [ ] Full independent message windows
- [ ] Calendar + invites + meeting providers
- [ ] All six added features (§5 Stage 8)
- [ ] All MCP tools; forbidden actions impossible
- [ ] Security requirements all met
- [ ] Installer builds; backup/restore + portable mode work
- [ ] Light default + easy Light/Dark toggle; brand styling matches the Style Guide
- [ ] Tests green; app builds and launches clean
Fix every gap before declaring done.

---

## 9. Packaging, local backup & USB portability (Stage 10 detail)
- **Installer:** use **electron-builder** to produce a Windows installer (NSIS `.exe`) and also a
  portable target. Since this is personal-use, skip code-signing/notarisation and any licence UI;
  a plain installer is fine.
- **Local database backup:** in Settings → Local storage, a **"Back up now"** action copies the
  SQLite DB (+ attachments + settings) into a single timestamped backup folder/file the user chooses
  — e.g. a USB drive. Provide **Restore from backup** too. Keep backups self-contained so they can be
  copied around freely.
- **USB / portable mode:** support running the app and its data from a USB drive so it moves between
  the owner's PCs. Detect a portable marker (e.g. a `portable.txt`/`data/` folder next to the
  executable, or `--portable`) and, when present, store the DB, attachments, credentials, and
  settings in that portable data directory instead of the OS app-data location. Document how to put
  the app + data on a USB stick and run it on another PC.
- Deliver the resulting **installer package** so the owner can install it on their PC now.

---

## 10. Styling rules
- Follow `Style Guide.dc.html` exactly: tokens, type scale, radius, spacing, elevation, component
  patterns, iconography (stroke, 1.7px, round caps, 24px grid, currentColor).
- **Light is the default theme.** The Light/Dark toggle is a single control in the command bar's
  top-right, always one click, never hidden inside layout/View Settings.
- Green (`--accent`) marks interactive things only; Claude's amber (`--claude`) is reserved for AI.
- **Copy/voice:** first person, British English, honest, no marketing fluff — see the brand guide's
  voice section. Empty states and errors should sound like Jamie, not a corporation.
- Avoid generic-AI tropes: no gradient-soup, no emoji unless the brand uses them, no rounded-card +
  left-accent-border cliché.

---

## 11. Definition of done
A working, installed DeskMail AI on Windows that lets the owner add an IMAP/SMTP account, sync and
read mail offline, configure layouts, double-click to open messages in their own windows, search,
compose/draft, send manually, use the calendar + meetings, and connect Claude Desktop via the local
MCP server for safe search/read/summarise/draft — all matching the Style Guide, with tests green,
an installer built, and local backup + USB portability working.
