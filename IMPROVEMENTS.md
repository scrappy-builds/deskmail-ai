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

Items already captured on `TODO.md` (Inbox subfolders, folder right-click menu, bulk-action bar
redesign, select-all tickbox, message-window live read-state, and the big Outlook-style top ribbon
with its action buttons + search/compose reshuffle) are **not** repeated here.

---

## Tier 1 — highest value, all local


---

## Tier 2 — clear improvements, low/medium effort

- [ ] **Keyboard shortcuts** — [med]. `j`/`k` navigate, `Enter` open, `e` archive, `#` delete, `r` reply, `c` compose, `/` focus search, `u` mark unread. Big daily-use speed-up; all local.

---

## Tier 3 — nice-to-haves

- [ ] **Local database encryption / master password** — [big]. SQLCipher-style, so a stolen laptop can't read the cached message bodies. (Passwords are already OS-encrypted; this would extend that to message content.)
- [ ] **Per-account colour accents throughout** — [easy]. Dots exist; extend to the reading pane.
- [ ] **Accent-colour picker** — [easy]. Let the user pick the single accent colour (the green) without a full theming system — small, high-impact polish.
- [x] **Polish pass: empty states, transitions, spacing consistency** — [med]. A deliberate visual once-over of the whole app.
- [ ] **Full theme editor with a colour picker (VERY LOW priority)** — [big]. An environment where you click a region (background, panels, etc.) and set its colour with a colour picker to recolour the whole app; icons stay as they are. Large job — parked here as a someday idea, explicitly low priority.

---

## Claude-assisted (via the local MCP connector — no extra services)

> ⚠️ **Re-scope needed.** These were written assuming *in-app* Claude UI (buttons/chips inside the
> email client). That in-app Claude UI has since been removed by choice — Claude now interacts with
> DeskMail only through Claude Desktop + the local connector. So pick these only if we deliver them
> **through Claude Desktop / the connector** (e.g. new MCP tools), not as in-app buttons. Ticking one
> means "let's work out the connector-side version."

Sending always stays gated — Claude only ever drafts unless I explicitly say send.


---

## Out of scope / would need external access (not recommended for now)

- [ ] **claude.ai (browser) connector** — needs a *hosted* MCP server with OAuth, not a local one.
- [ ] **Server-side vacation responder / server filters** — needs Sieve/provider support.
- [ ] **Push (IMAP IDLE) for instant new-mail** — doable locally-ish but adds a long-lived connection; medium risk. (Current model is periodic sync.)
- [ ] **Machine translation, calendar free/busy, contact photos/Gravatar, link previews** — all pull from third-party services.
- [ ] **PGP/S-MIME encryption** — possible locally but heavy; only worth it if I actually exchange signed mail.
