# PROGRESS — DeskMail AI build log

> **Claude Code: this file is the single source of truth for "where we are".**
> - Read it first at the start of every session (then `git log` + run the app/tests to confirm).
> - Update it at the end of every stage: tick the stage, note what was done, list TODOs/known
>   issues, and record the exact next step.
> - Keep it accurate — trust it over memory.

---

## Current status
- **Active stage:** Stage 2 complete (awaiting go-ahead for Stage 3).
- **Last session ended:** 2026-07-09 — Stage 2 built, tested, committed.
- **Exact next step:** On user's OK, start **Stage 3 — Full independent message windows**: double-click
  a message opens it in its own `BrowserWindow` (own preload, no Node), loaded by message ID; multiple
  windows coexist; full toolbar + Claude actions. Wire the `onOpen` hooks already threaded through
  Workspace → MessageList/ReadingPane. Respect `openEmailBehaviour` (full-window vs reading-pane).

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
- **DB:** **better-sqlite3** (synchronous, native, standard for Electron main). Hand-rolled version-based **migration runner** (`user_version` pragma) — no migration framework needed.
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
- [ ] **Stage 3** — Full independent message windows (double-click, by ID)
- [ ] **Stage 4** — SQLite + migrations + account wizard + secure credentials + connection tests
- [ ] **Stage 5** — Sync + parsing + offline cache + safe rendering (sanitise, block remote images)
- [ ] **Stage 6** — Search + Compose + Drafts + manual Send + signature insertion
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
