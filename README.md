# DeskMail AI — Design Handoff Pack

A local, single-user Windows desktop email client with a built-in Claude Desktop (MCP) connector.
This pack is everything a developer (or Claude Code) needs to build the real application.

---

## What's in this pack

```
design_handoff_deskmail_ai/
├── README.md                     ← you are here
├── CLAUDE_CODE_PROMPT.md         ← the master build brief. Paste into Claude Code to start.
├── PROGRESS.md                   ← the living build log. Claude Code updates this each stage so
│                                   work resumes cleanly across sessions.
├── FEATURE_SPEC.md               ← detailed behaviour for every feature (incl. the 6 additions).
├── Functional3DUK_Brand_Guide.md ← the brand + voice reference.
└── design-files/
    ├── DeskMail AI.dc.html        ← the full interactive UI prototype (open in a browser)
    ├── Claude Panel.dc.html       ← the Claude assistant panel (used inside the app)
    ├── Style Guide.dc.html        ← the visual system: colours, type, spacing, components, voice
    └── support.js                 ← runtime needed for the .dc.html files to open
```

### How to view the design files
Open any `.dc.html` file in a modern browser (Chrome/Edge). They are self-contained and
interactive — click around: switch Mail/Calendar, open Compose, the Claude panel, Settings,
double-click a message to open it in its own window, accept the calendar invite, toggle light/dark
(top-right), and try the layout presets.

**These HTML files are design references, not production code.** They show the intended look and
behaviour precisely. The job is to **recreate them in a real Electron + React + TypeScript + Tailwind
app** (see the build brief), not to ship the HTML.

---

## Fidelity
**High-fidelity.** Colours, typography, spacing, component styling, and interactions are final.
Recreate the UI pixel-close using the values in `Style Guide.dc.html` and the token list below.

---

## The product in one paragraph
DeskMail AI connects to IMAP/SMTP (and optionally POP3) accounts, syncs mail into a local SQLite
store, and shows it in a polished, highly configurable desktop interface (flexible reading pane,
sidebar, and layout presets). It has a Calendar with meeting-provider support (Teams/Meet/Zoom),
Compose with signatures and attachments, and a **local MCP server** so Claude Desktop can safely
**search, read, summarise, and draft** — never send or delete without explicit user approval.
It is **single-user, for the owner only** — no sign-up, no licensing/EULA screens.

---

## Design tokens (from the Style Guide)

**Light theme (default)**
| Token | Value | Role |
|---|---|---|
| `--bg` | `#f5f5f5` | app background |
| `--bg-2` | `#ffffff` | panels / cards |
| `--bg-3` | `#efefef` | raised / hover |
| `--border` | `#e4e4e4` | dividers |
| `--text` | `#111111` | primary text |
| `--text-2` | `#4d4d4d` | secondary text |
| `--text-3` | `#8a8a8a` | tertiary/meta |
| `--accent` | `#1e7a38` | interactive / brand green |
| `--accent-2` | `#1a5c28` | hover / pressed (brand dark green) |
| `--claude` | `#bf8420` | Claude / AI accent |

**Dark theme**
| Token | Value | Role |
|---|---|---|
| `--bg` | `#111111` | app background (brand near-black) |
| `--bg-2` | `#181818` | panels |
| `--bg-3` | `#202020` | raised / hover |
| `--border` | `#2a2a2a` | dividers |
| `--text` | `#ffffff` | primary text |
| `--text-2` | `#cccccc` | secondary text |
| `--text-3` | `#7d7d7d` | tertiary/meta |
| `--accent` | `#2fae4f` | interactive / brand green |
| `--accent-2` | `#38bd59` | hover |
| `--claude` | `#e0a13a` | Claude / AI accent |

**Semantic:** success `#1a9e5e`/`#54d18a` · danger `#dc2f42`/`#f0787a` · star `#e0a72b`/`#f2c14e`
(light/dark).

**Type:** Hanken Grotesk (UI/body) · JetBrains Mono (technical: shortcuts, ports, IDs, tool names).
**Radius:** 6 (sm) · 9 (md) · 12 (lg) · 20/pill. **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48.
**Accent rule:** green means "you can act on this" — never decorative fills.

The app defaults to **light**; a one-click Light/Dark toggle lives in the **top-right of the command
bar** (not buried in layout settings). Six alternate accent palettes exist (Teal, Indigo, Emerald,
Sunset, Plum, Cobalt) but **brand green is the default**.

---

## Screens in the prototype
- **Main window** — title bar (File/View/Help menus + window controls), command bar (Mail/Calendar
  tabs, layout preset, search, Compose, Claude, View Settings, Light/Dark), and the workspace.
- **Mail** — sidebar (accounts, folders, custom views), message list, configurable reading pane.
- **Reading pane** — action toolbar (reply/reply-all/forward/archive/delete/star/unread), remote-image
  block banner, invite card (Accept → adds to Calendar), attachments.
- **Full message window** — opened by double-click; independent window with full toolbar + Claude actions.
- **Calendar** — month view, colour-coded events, New Event modal with meeting-provider picker.
- **Compose** — from/to/cc/bcc, subject, body, Claude rewrite bar, signature block, attachments.
- **Claude panel** — slide-over / float / dock; read & draft only; action chips.
- **Settings** — Accounts, Signatures, Sending, Meetings, Claude connector, Appearance, Security.
- **View Settings** — layout presets + fine-tune controls.
- **Style Guide** — the living design system.

Full behaviour for each is in `FEATURE_SPEC.md`. Build order, packaging, backup/portability, testing,
and the staged working method are in `CLAUDE_CODE_PROMPT.md`.

---

## Running the app (development)

```bash
npm install
npm run dev        # launch the app with hot reload
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright for Electron)
npm run build      # production build into out/
```

> Note: on this machine the `electron` binary and `node-sqlite3-wasm` are plain downloads/WASM — no
> native compiler is needed. If `node_modules/electron/dist` ends up empty after install, extract the
> cached zip from `%LOCALAPPDATA%\electron\Cache` into it (see `PROGRESS.md`).

---

## Connecting Claude Desktop (local MCP server)

DeskMail ships a **local MCP server** so Claude Desktop can safely **search, read, summarise, and
draft** across your mail. It exposes only these read/draft tools:

`list_accounts`, `list_folders`, `search_emails`, `read_email`, `create_draft`,
`find_related_emails`, `find_unanswered_emails`, `extract_dates_and_deadlines`, `summarise_thread_data`.

**It can never** send email, delete anything, read your credentials, change account settings, or touch
files outside DeskMail's own storage. Drafts it creates are stored locally for you to review and send
manually — Claude never sends.

To connect: open **Settings → Claude connector** in DeskMail and copy the generated config into Claude
Desktop's `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config), then
restart Claude Desktop. The config launches `out/main/mcp-server.js` via DeskMail's own binary in Node
mode (`ELECTRON_RUN_AS_NODE=1`) and points it at your local `deskmail.db` through `DESKMAIL_DB`.
