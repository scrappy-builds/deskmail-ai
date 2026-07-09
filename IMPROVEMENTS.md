# DeskMail AI — Ideas & possible improvements

A working list of features that would make DeskMail feel closer to (or better than) Thunderbird and
Outlook, **filtered to what's realistic for a single-user, local desktop client that I control**.

Ground rules I used:
- **No new external services / servers.** Everything runs on this PC against the mail already synced
  into the local SQLite store (or uses the account's own IMAP/SMTP, which we already have).
- **No cloud accounts, no telemetry, no multi-user.**
- Anything that needs a hosted server, a third-party API, or someone else's infrastructure is called
  out separately at the bottom as "out of scope / would need external access".

Legend: **[built]** already in · **[easy]** hours · **[med]** a day or so · **[big]** multi-day.

---

## Tier 1 — highest value, all local

### Conversation threading (group a reply chain) — [med]
Outlook/Thunderbird group a subject's back-and-forth into one expandable thread. We already store
`message_id_header` and subjects; group by normalised subject / `In-Reply-To` and render a collapsed
thread in the reading pane. Big readability win.

### Unified inbox across accounts — [med]
Once there's more than one account, a single "All inboxes" view (and "All unread"). Pure query over
the existing `messages` table; add a virtual folder in the sidebar.

### Local rules / filters engine — [med]
"When mail arrives from X → move to folder Y / star / mark read / mark as junk." Thunderbird's
message filters. This is a natural extension of the junk pipeline and the `mail_actions` queue: a
`rules` table + a small evaluator run on ingest. Also offer **"Create a rule from this message"** from
the reading pane (e.g. always file newsletters).

### Full-text search index (FTS5) — [easy]
Current search is a `LIKE` scan — fine now, slower on a big mailbox. SQLite FTS5 gives fast search and
**search operators** (`from:maya subject:invoice has:attachment before:2026-07-01`). Highest
value-for-effort of the search work.

### Desktop notifications + tray icon — [med]
New-mail toast notifications (Electron `Notification`), a system-tray icon with an unread badge, and
"minimise to tray". The thing that makes it feel like a real always-on client. All local.

### Custom smart-view builder — [med]
The one FEATURE_SPEC item not yet built: a match-all/any condition builder that saves as a sidebar
"smart view". Sits directly on top of `searchEmails`.

---

## Tier 2 — clear improvements, low/medium effort

### Print / export a message to PDF — [easy]
The Print button in the full window isn't wired yet. `webContents.printToPDF()` (we already use it for
the guides) turns any email into a PDF. Also **export to `.eml`** (we already do this for NotebookLM).

### Undo for archive / delete / move — [easy]
We have the toast + undo pattern (send). Reuse it: an "Undo" on archive/trash that re-applies the
reverse `mail_action`. Very Gmail-like.

### Keyboard shortcuts — [med]
`j`/`k` to move through the list, `Enter` to open, `e` archive, `#` delete, `r` reply, `c` compose,
`/` focus search, `u` mark unread. Big speed-up for daily use; all local.

### Tags / labels UI — [med]
The `labels` + `message_labels` tables already exist but there's no UI. Add colour tags you can apply
to messages and filter by. (Distinct from folders — a message can have several.)

### Rich signatures + multiple signatures — [easy/med]
Signatures are plain text today. Allow simple HTML (bold/links) via the TipTap editor, and let an
account have more than one selectable at compose time.

### Bayesian "learn from my junk" — [med]
Right now junk is a fixed keyword heuristic. Add a simple local Bayesian filter that learns from what
I mark as junk / not junk (token frequencies in a local table). No external service — this is exactly
how SpamAssassin/Thunderbird's adaptive filter works, just smaller.

### Attachment reminder — [easy]
If the body says "attached"/"see attachment" and nothing is attached, warn before Send. Classic
Outlook nicety, trivial and local.

### Auto-backup on a schedule — [easy]
We have manual "Back up now". Add an optional "back up automatically to this folder every N days" so a
USB/second-drive copy stays current without me remembering.

### Reply/Forward prefill — [easy]
The Reply/Reply-all/Forward buttons exist but open a blank compose. Prefill recipients, `Re:`/`Fwd:`
subject, and a quoted body. (Small gap from the current build.)

### Contacts: manual add/edit + groups — [med]
Contacts are auto-collected but read-only. Add manual create/edit, notes, and simple groups/lists for
quick addressing.

---

## Tier 3 — nice-to-haves

- **Calendar week/day views + reminders/notifications** (month view is built; events are local). [med]
- **Recurring events** (RRULE) in the local calendar. [med]
- **Focus / Do Not Disturb** — mute notifications on a schedule. [easy]
- **Message pinning** and **mute thread**. [easy]
- **Read-later / "Today" tuning** — let me choose what counts as "needs attention". [easy]
- **Density/font-size accessibility control** beyond the current density presets. [easy]
- **Import from `.mbox` / `.eml`** so I can bring in an old archive locally. [med]
- **Local database encryption / master password** (SQLCipher-style) so a stolen laptop can't read the
  cache. Note: passwords are already OS-encrypted; this would protect message bodies too. [big]
- **Per-account colour accents throughout** (dots exist; extend to the reading pane). [easy]
- **"Snippet" quick replies** inline in the reading pane (one-line reply without opening compose). [med]

---

## Claude-assisted (uses the connector I already built — no extra services)

These lean on the local MCP connector + Claude Desktop, so no new infrastructure:
- **One-click "Summarise this thread"** button that shows Claude's summary inline (today it's a chip).
- **"Draft a reply" inline** with the tone chips actually wired to Claude via the connector.
- **Auto-categorise / triage** — Claude suggests folder/label/priority; I approve.
- **"Turn into task/event"** — Claude extracts a to-do or a calendar event from an email (the
  `extract_dates_and_deadlines` tool already returns the raw data).
- **NotebookLM: pick the target notebook in-app** and hand Claude both the export path and the
  notebook name in one step.

---

## Out of scope / would need external access (noted, not recommended for now)

- **claude.ai (browser) connector** — needs a *hosted* MCP server with OAuth, not a local one.
- **Server-side vacation responder / server filters** — needs Sieve/provider support.
- **Push (IMAP IDLE) for instant new-mail** — doable locally-ish but adds a long-lived connection;
  medium risk. (Current model is periodic sync.)
- **Machine translation, calendar free/busy, contact photos/Gravatar, link previews** — all pull from
  third-party services.
- **PGP/S-MIME encryption** — possible locally but heavy; only worth it if I actually exchange signed mail.

---

*My pick if you want a short list to start with:* threading, FTS5 search + operators, a rules engine
(with "create rule from message"), desktop notifications + tray, and wiring Reply/Forward + Print.
Those five would make it feel like a daily driver.
