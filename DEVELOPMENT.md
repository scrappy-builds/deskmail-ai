# DeskMail AI — Developer notes

A local, single-user Windows desktop email client: Electron + React + TypeScript + Tailwind, a local
SQLite store, IMAP/SMTP sync, sanitised rendering, a calendar, and a local MCP server so Claude
Desktop can safely search / read / summarise / draft.

## Stack

| Concern | Choice |
|---|---|
| Shell / build | Electron + **electron-vite** (dev HMR + prod build), **electron-builder** for the installer |
| UI | React 18 + TypeScript (strict) + Tailwind CSS (tokens from the Style Guide as CSS vars) |
| State | **Zustand** — `layoutStore` (UI/layout) and `mailStore`/`calendarStore` (data) kept separate |
| Database | **node-sqlite3-wasm** — real on-disk SQLite via WASM (no native compiler needed) |
| Mail | **imapflow** (IMAP), **nodemailer** (SMTP), **mailparser** (parse) |
| Rendering safety | **DOMPurify** + a sandboxed `<iframe>` |
| Compose editor | **TipTap** (ProseMirror) → sanitised HTML |
| Credentials | Electron **safeStorage** (DPAPI on Windows) — ciphertext only |
| Claude connector | **@modelcontextprotocol/sdk** — a local stdio server |

> Why node-sqlite3-wasm and not better-sqlite3: this dev machine has no MSVC toolchain and no
> Node-24 prebuild, so better-sqlite3 can't build. The WASM SQLite is a drop-in with the same
> synchronous API, real on-disk durability, and identical behaviour in Node (tests) and Electron.

## Layout

```
src/
  main/       Electron main: window mgmt, IPC, background sync + scheduled sender, backup, meetings, credentials
  preload/    contextBridge — the only surface the renderer can touch (window.deskmail)
  renderer/   React UI: regions/, compose/, calendar/, today/, settings/, mail/, store/
  shared/     framework-free types + logic (layout, meetings, db shapes) used by main, renderer, tests
  db/         schema + migration runner + typed query modules
  mcp/        the safe MCP tool set + the standalone stdio server
tests/        unit (Vitest) + e2e (Playwright for Electron)
```

## Running

```bash
npm install
npm run dev        # app with hot reload
npm test           # Vitest unit tests
npm run test:e2e   # Playwright-for-Electron E2E
npm run build      # production build → out/
npm run package    # build + electron-builder → release/ (NSIS installer + portable exe)
```

Handy env hooks (used by tests, also useful manually):
- `DESKMAIL_USER_DATA=<dir>` — override the data directory.
- `DESKMAIL_SEED_DEMO=1` — seed a demo mailbox on first run (empty DB only).
- `DESKMAIL_DB=<file>` — DB path for the standalone MCP server.
- `--portable [dir]` — run in portable/USB mode (data next to the exe, or in the given dir).

## Architecture rules

- The **renderer has no Node access** (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`).
  Everything goes through the typed preload bridge (`src/shared/types.ts` → `DeskMailApi`).
- The **main process owns all system access**: DB, network, filesystem, secure store. Background work
  (IMAP sync, the scheduled/undo sender) runs there, off the UI thread.
- **Layout state is separate from data state** (`layoutStore` vs `mailStore`/`calendarStore`), persisted
  to the `layout_preferences` table.
- The DB evolves via a **version-based migration runner** (`user_version`); append migrations, never edit
  a shipped one.

## Security model

- Windows are frameless but locked down: no Node in the renderer, a strict CSP, external links open in
  the browser, in-app navigation is blocked, and webviews are refused (`hardenWindow`).
- **Email HTML is sanitised** (DOMPurify: scripts/handlers/iframes/forms stripped) and rendered in a
  `sandbox` (no-scripts) iframe. **Remote images are blocked by default** with a "Load images" opt-in.
  Attachments are listed, never auto-opened.
- **Credentials** are encrypted with the OS secure store; only ciphertext is written to disk.
- **Sending is always a manual action.** Even immediate sends go through a short undo window before the
  background sender delivers them. There is no automatic send path.
- The **MCP server exposes only read/draft tools** (`src/mcp/tools.ts`). It cannot send, delete, read
  credentials, change settings, or touch files outside the app's DB. Drafts Claude creates are stored
  locally (`created_by = 'claude'`) and surfaced in the in-app **Drafts** view for the user to send.

See `PROGRESS.md` for the staged build log and per-stage notes, `FEATURE_SPEC.md` for behaviour, and
`README.md` for the connector setup.
