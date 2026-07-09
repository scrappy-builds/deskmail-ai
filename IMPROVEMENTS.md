# DeskMail AI — Ideas & possible improvements

A working list of features that would make DeskMail feel closer to (or better than) Thunderbird and
Outlook, **filtered to what's realistic for a single-user, local desktop client that I control**.

Ground rules:
- **No new external services / servers.** Everything runs on this PC against the mail already synced
  into the local SQLite store (or the account's own IMAP/SMTP, which we already have).
- **No cloud accounts, no telemetry, no multi-user.**
- Anything needing a hosted server, a third-party API, or someone else's infrastructure is listed at
  the bottom as "out of scope".

**How to use this list:** tick the boxes (`- [x]`) next to the items you want next, then tell me to
"work on the ticked items in IMPROVEMENTS.md". I'll build them and delete each one from this file as
it's completed, so what's left is always the outstanding backlog.

Effort legend: **[easy]** hours · **[med]** a day or so · **[big]** multi-day. Feasibility was
re-checked on 2026-07-09 — notes added inline where anything needs a caveat.

---

## Tier 1 — highest value, all local

- [ ] **Conversation threading** — [med]. Group a subject's back-and-forth into one expandable thread in the reading pane. Grouping by normalised subject works with what's stored today; true `In-Reply-To` threading needs a new column on `messages` plus capturing that header on sync (small addition — flagged, still achievable).
- [ ] **Unified inbox across accounts** — [med]. A single "All inboxes" / "All unread" view once there's more than one account. Pure query over `messages`; add a virtual folder in the sidebar.

---

## Tier 2 — clear improvements, low/medium effort

- [ ] **Keyboard shortcuts** — [med]. `j`/`k` navigate, `Enter` open, `e` archive, `#` delete, `r` reply, `c` compose, `/` focus search, `u` mark unread. Big daily-use speed-up; all local.

---

## Tier 3 — nice-to-haves

- [ ] **Import from `.mbox` / `.eml`** — [med]. Bring in an old archive locally.
- [ ] **Local database encryption / master password** — [big]. SQLCipher-style, so a stolen laptop can't read the cached message bodies. (Passwords are already OS-encrypted; this would extend that to message content.)
- [ ] **Per-account colour accents throughout** — [easy]. Dots exist; extend to the reading pane.

---

## Claude-assisted (via the local MCP connector — no extra services)

> ⚠️ **Re-scope needed.** These were written assuming *in-app* Claude UI (buttons/chips inside the
> email client). That in-app Claude UI has since been removed by choice — Claude now interacts with
> DeskMail only through Claude Desktop + the local connector. So pick these only if we deliver them
> **through Claude Desktop / the connector** (e.g. new MCP tools), not as in-app buttons. Ticking one
> means "let's work out the connector-side version."

- [ ] **Summarise a thread** — via the connector, using the thread data the MCP tools already expose.
- [ ] **Draft a reply** — connector-side draft creation (already supported by `create_draft`); the tone options would be prompt-side in Claude Desktop, not in-app chips.
- [ ] **Auto-categorise / triage** — Claude proposes folder/label/priority through the connector; I review the results in the app.
- [ ] **"Turn into task/event"** — Claude extracts a to-do or calendar event from an email (`extract_dates_and_deadlines` already returns the raw data).
- [ ] **NotebookLM: pick the target notebook** — hand Claude both the export path and the notebook name in one step.

---

## Out of scope / would need external access (not recommended for now)

- **claude.ai (browser) connector** — needs a *hosted* MCP server with OAuth, not a local one.
- **Server-side vacation responder / server filters** — needs Sieve/provider support.
- **Push (IMAP IDLE) for instant new-mail** — doable locally-ish but adds a long-lived connection; medium risk. (Current model is periodic sync.)
- **Machine translation, calendar free/busy, contact photos/Gravatar, link previews** — all pull from third-party services.
- **PGP/S-MIME encryption** — possible locally but heavy; only worth it if I actually exchange signed mail.

---

*My pick for a strong "daily driver" starter set:* threading, FTS5 search + operators, a rules engine
(with "create rule from message"), desktop notifications + tray, and wiring Reply/Forward + Print.
