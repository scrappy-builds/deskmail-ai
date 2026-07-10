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

**Every item is pre-planned.** Each one links to a numbered plan in
[`IMPLEMENTATION_PLANS.md`](IMPLEMENTATION_PLANS.md) — approach, files, data changes, tests,
dependencies. When an item is ticked and picked up, its plan gets expanded into a full step-by-step
build plan against the code as it stands then, and both entries are deleted on completion.

Effort legend: **[easy]** hours · **[med]** a day or so · **[big]** multi-day. Rebuilt from a full
code audit on 2026-07-10. **2026-07-10: the big ticked batch (30 items) was built and shipped —
what's below is the whole outstanding backlog.**

---

## Tier 1 — highest value, all local

What stands between DeskMail and being the only mail client I need open.

- [ ] **Full mail sync — all folders, deeper history, incremental** — [big] → plan 1. Today sync
  pulls **only INBOX, only the most recent 50 messages**, and re-fetches that same window every 2
  minutes. Sent, Archive and server-side folders appear in the sidebar but never fill; anything
  older than the last 50 is invisible; search, threading and the unified inbox can only see that
  slice. Sync every folder, track UIDs so each cycle fetches only what's new, configurable depth
  with "load older" back-fill. The single biggest gap in the app.
- [ ] **Keyboard shortcuts** — [med] → plan 3. `j`/`k` navigate, `Enter` open, `e` archive,
  `#` delete, `r` reply, `c` compose, `/` focus search, `u` mark unread, `?` cheat-sheet. No global
  shortcuts exist today at all.
- [ ] **Default mail app (mailto: handler)** — [easy] → plan 4. Clicking an email link anywhere in
  Windows opens DeskMail's Compose pre-filled. The difference between *a* mail app and *my* mail app.

---

## Parked — ticked in the last batch, held back by their own plans' gates

- [ ] **POP3 sync** — [med] → plan 25. Was ticked, but the plan's own gate says: *confirm an actual
  POP3 account is wanted before building — otherwise this stays parked.* No POP3 account exists yet.
  Tick again (or just say so) once one is actually needed.
- [ ] **Database work off the main thread** — [big] → plan 32. Was ticked, but the plan says
  *measure first — do not build speculatively*, and measuring needs a full mailbox, which needs
  plan 1 (full sync) first. Build plan 1, seed a big store, measure, then decide.

---

## Tier 3 — nice-to-haves

- [ ] **Local database encryption / master password** — [big, currently blocked] → plan 26. The WASM
  SQLite driver has no SQLCipher build, and this machine can't compile native modules — see the plan
  for the honest options. (Passwords are already OS-encrypted; BitLocker covers the disk.)

---

## Out of scope / would need external access (not recommended for now)

- [ ] **claude.ai (browser) connector** — needs a *hosted* MCP server with OAuth, not a local one.
- [ ] **Server-side vacation responder / server filters** — needs Sieve/provider support.
- [ ] **Machine translation, calendar free/busy, contact photos/Gravatar, link previews** — all pull
  from third-party services.
- [ ] **PGP/S-MIME encryption** — possible locally but heavy; only worth it if I actually exchange
  signed mail.
- [ ] **Semantic / AI search inside the app** — needs an API (breaks ground rules) or a bundled
  local model (huge). Claude Desktop over the connector already covers this well enough.
- [ ] **Read receipts** — widely ignored by receiving clients; mostly disappointment as a feature.
- [ ] **Auto-update** — needs a hosted update feed. A manual "check version" is all that's honest here.
