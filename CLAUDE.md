# DeskMail AI — guide for Claude

You're helping someone **modify an existing, working desktop email client**. This file
tells you how it's built, the rules you must not break, and how to run and test your
changes. Read it before editing.

## What this is

DeskMail AI is a local, single-user **Electron + React + TypeScript** email client for
Windows. Mail is fetched over IMAP/SMTP and cached in a local **SQLite** database
(`node-sqlite3-wasm` — WebAssembly, no native build). A separate **MCP server** lets
Claude Desktop read and draft mail.

## Golden rules (do not break these)

1. **Local-only, private.** No telemetry, no analytics, no cloud accounts, no phoning
   home. Mail never leaves the machine except to the user's own mail server and their
   own Claude.
2. **Credentials stay secret.** Passwords live in the OS keychain via Electron
   `safeStorage`. Never write a password to the database in plain text, never log it,
   never expose it to the renderer or the MCP server.
3. **The MCP connector is read-and-draft only.** It may read, search, draft, and do
   reversible organise actions. It must **never** send mail, permanently delete, read
   credentials, or write files outside DeskMail's storage. The test in
   `tests/unit/mcp.test.ts` enforces the exact tool set — keep it honest.
4. **Never send or hard-delete without explicit user action.** Draft ≠ send. Delete
   means move-to-Trash unless the user explicitly asks for permanent deletion (from
   Trash/Junk, behind a confirm).

## How to run, test, build

```bash
npm install
npm run dev          # app with hot reload
npm test             # unit tests (Vitest)
npm run typecheck    # tsc for both the node and web projects
npm run test:e2e     # Playwright drives the built app
npm run build        # production build into out/
npm run package      # Windows installer into release/
```

Always run `npm run typecheck` and `npm test` after a change. For anything touching mail
sync or the UI, verify in the real app (`npm run dev`) — see the project's `verify`
skill notes if present.

## Where things live (`src/`)

- **`src/main/`** — Electron main process. `index.ts` wires every `ipcMain.handle(...)`.
  `src/main/mail/` is the mail engine: `sync.ts` (folder sync + back-fill),
  `connectionPool.ts` (kept-alive IMAP), `drainer.ts` (pushes queued actions to IMAP),
  `idle.ts` (push notifications), `send.ts`, `connectionTest.ts`.
- **`src/preload/index.ts`** — the **only** bridge between renderer and main. Every
  capability the UI has is a typed method here (`window.deskmail.*`).
- **`src/renderer/`** — the React UI. `App.tsx` is the root; `regions/` and `settings/`
  hold the panes; `styles.css` + `src/shared/theme.ts` define the theme tokens.
- **`src/db/`** — SQLite access. `schema.ts` is the versioned migration list (append a
  new entry, never edit a shipped one). `messages.ts`, `folders.ts`, `mailActions.ts`,
  etc. are the typed queries.
- **`src/shared/`** — types and pure logic shared across processes (`db.ts`, `types.ts`,
  `theme.ts`, `providerPresets.ts`). The renderer imports these via the `@shared` alias.
- **`src/mcp/`** — the standalone MCP server (`server.ts`) and its tools (`tools.ts`).
  It opens the same SQLite database directly; it does not talk to the running app.
- **`tests/unit/`** — Vitest. **`tests/e2e/`** — Playwright.

## House style

- **Match the surrounding code.** Comment density, naming, and idiom already vary by
  area — follow the file you're in.
- Types are shared in `src/shared`; keep IPC payloads typed on both sides of the bridge.
- Add a DB change as a new `schema.ts` migration; never mutate an existing one.
- Keep changes small and focused; add a unit test for non-trivial logic. Prefer editing
  existing files over adding new ones.
- British English in user-facing copy.
