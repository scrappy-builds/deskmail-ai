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

- [x] **Conversation threading** — [med]. Group a subject's back-and-forth into one expandable thread in the reading pane. Grouping by normalised subject works with what's stored today; true `In-Reply-To` threading needs a new column on `messages` plus capturing that header on sync (small addition — flagged, still achievable). (Note from Jamie: This should be an option that can be turned on or off)
- [x] **Unified inbox across accounts** — [med]. A single "All inboxes" / "All unread" view once there's more than one account. Pure query over `messages`; add a virtual folder in the sidebar.

---

## Tier 2 — clear improvements, low/medium effort

- [ ] **Keyboard shortcuts** — [med]. `j`/`k` navigate, `Enter` open, `e` archive, `#` delete, `r` reply, `c` compose, `/` focus search, `u` mark unread. Big daily-use speed-up; all local.
- [x] **File menu (real entries)** — [med]. New email / New event, **Open… (.eml)**, **Save As… (.eml / .pdf / .html)**, **Print**, **Import…**, **Export…**, **Export settings** (back up accounts + preferences to a file), Settings, Exit. (Print-to-PDF already exists — this just surfaces it in the menu.)
- [x] **Edit menu** — [easy]. Undo (last mail action), Select all, Find / Find in message, Mark read / unread, Delete.
- [x] **View menu** — [med]. View settings, a **Layout drop-down** showing the preset views (Classic / Bottom / Focus / Wide / Right / List-only) as a menu, **Folder-pane show/hide**, reading-pane position, message-list density, **Expand / collapse all conversations**, **Zoom (text size) in/out/reset**, and Sort / Arrange-by.
- [x] **Message / Actions menu** — [easy]. Reply, Reply all, Forward, Move to, Categorise, Flag / Unflag, Pin, Snooze, Block sender, Mark all read — the same actions as the ribbon, reachable from the menu bar.
- [x] **Pop-out message window: own menu bar + fuller toolbar** — [med]. File (Save As / Print / Close), Message (reply/forward/move/categorise/flag/pin/snooze), View (zoom, show full headers). Parity with the reading-pane actions. (Today the pop-out only has reply/forward/archive/delete/star/print/mark-read.)
- [x] **Pop-out message window: Next / Previous navigation** — [med]. Arrows (and keyboard) to step through the folder without going back to the list.
- [x] **Sort / Arrange-by** — [med]. Sort the list by date, sender, subject, size, unread, flagged; ascending/descending. Currently fixed to pinned-then-date.
- [x] **Group by date headers** — [easy/med]. "Today / Yesterday / This week / Older" separators in the list, like both clients.
- [x] **Drag an email onto a sidebar folder to move it** — [med]. Direct drag-to-file, in addition to the Move menu.
- [x] **"Mark read" behaviour preference** — [easy]. Choose: mark read on select / after N seconds / never auto-mark. Thunderbird-style; today it always marks read on open.
- [x] **Mark all as read (folder)** — [easy]. Right-click a folder → Mark all read.
- [x] **Empty Junk / Empty Trash + permanent delete** — [med]. This is really about
  *permanent* deletion, which the app currently has no way to do — Delete only ever
  *moves to Trash* (reversible), so once mail is in Trash it just sits there. Add:
    - **Right-click Trash (and Junk) in the folder tree → "Empty deleted items" /
      "Empty Junk"** — permanently removes everything in the folder, behind a confirm
      (it can't be undone).
    - **Selecting emails inside Trash and pressing Delete** should **permanently
      delete** them. Today nothing happens — Delete tries to move-to-Trash, but they're
      already there, so it's a no-op.
    - Every permanent-delete path must also **remove the message from the mail server**,
      not just the local cache, so it doesn't reappear on the next sync.
  *Note for implementer:* deliberate new capability — the app was built with **no
  permanent-delete action** on purpose (safety; the MCP/Claude tools also exclude it).
  `MailOp` in `src/shared/db.ts` has no hard delete. Add an op (e.g. `delete-forever`)
  that removes the local `messages` row(s) **and** queues an IMAP expunge/delete via the
  mail-actions drainer. Wire the ribbon/bulk **Delete** to map to `delete-forever` when
  the current folder is Trash (or Junk), add the folder-tree right-click empty actions,
  and gate everything behind a confirm dialog.
- [x] **Block sender → Junk (one click)** — [easy]. From a message, create a rule that routes this sender to Junk (uses the existing rules engine).

---

## Tier 3 — nice-to-haves

- [x] **Import from `.mbox` / `.eml`** — [med]. Bring in an old archive locally.
- [x] **Export a folder/mailbox to `.mbox`** — [med]. The reverse of the import; a proper local backup/portability path.
- [x] **Import / export contacts as vCard (`.vcf`)** — [easy/med]. Bring an address book in or out locally.
- [x] **Pop-out: Show original / full headers + "View source"** — [easy]. Raw headers and the raw message, like Thunderbird's "View Source".
- [x] **Pop-out: Save message as `.eml` / `.html`** — [easy]. Save the open email to disk (complements the existing Print-to-PDF).
- [x] **Multi-column list view (optional)** — [big]. A classic table view (sortable From / Subject / Date / Size columns) as an alternative to the current card rows.
- [x] **Folder unread/total counts + collapsible tree** — [easy]. Show totals and let folder groups collapse (pairs with the Inbox-subfolders work on `TODO.md`).
- [x] **Follow-up flag with a reminder date** — [med]. Flag an email "follow up by <date>" and surface it in Today when due (snooze exists; this is a dated flag).
- [x] **Importance / priority marker (High / Normal / Low)** — [easy]. Set and show a priority marker on messages (reads the `Importance` header on sync; settable on send).
- [x] **Inline images + attach from the compose window** — [med]. Confirm/extend drag-in attachments and inline image paste.
- [ ] **Local database encryption / master password** — [big]. SQLCipher-style, so a stolen laptop can't read the cached message bodies. (Passwords are already OS-encrypted; this would extend that to message content.)
- [ ] **Per-account colour accents throughout** — [easy]. Dots exist; extend to the reading pane.
- [ ] **Accent-colour picker** — [easy]. Let the user pick the single accent colour (the green) without a full theming system — small, high-impact polish.
- [x] **Taskbar unread badge** — [easy/med]. Show the unread count as a Windows taskbar overlay badge, like Outlook.
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

- [x] **Summarise a thread** — via the connector, using the thread data the MCP tools already expose.
- [x] **Draft a reply** — connector-side draft creation (already supported by `create_draft`); the tone options would be prompt-side in Claude Desktop, not in-app chips.
- [x] **Auto-categorise / triage** — Claude proposes folder/label/priority through the connector; I review the results in the app.
- [x] **"Turn into task/event"** — Claude extracts a to-do or calendar event from an email (`extract_dates_and_deadlines` already returns the raw data).
- [x] **NotebookLM: pick the target notebook** — hand Claude both the export path and the notebook name in one step.
- [x] **Inbox at-a-glance tool** — [easy]. "How many unread do I have?" — counts per folder/account in one call, so Claude can answer without stitching searches together.
- [x] **Priority triage / "what needs a reply, ranked"** — [med]. A tool that returns unanswered/important mail ordered by a priority heuristic (sender, direct-to-me, questions asked, age), so Claude can list "respond to these first" and offer to draft each.
- [x] **Batch auto-organise (propose → review → apply)** — [med]. Claude proposes folder/label moves for a batch; I approve; one tool applies them all. Turns the single `move_email` into a reviewed bulk sweep.
- [x] **Propose rules from patterns** — [med]. Claude spots recurring senders/subjects and suggests filter rules; I one-click accept them into the rules engine.
- [x] **Unsubscribe from obvious noise (e.g. LinkedIn notifications)** — [med]. Parse the standard `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 2369 / 8058) and either fire the one-click HTTP unsubscribe or send the mailto unsubscribe — no Chrome extension needed. *Caveat:* the one-click path contacts the sender's own unsubscribe URL (that's the unsubscribe action itself, not a third-party service); always show me what it will do and let me confirm. Claude could learn which senders I routinely unsubscribe from.
- [x] **Background "email concierge" recipes** — [easy, mostly prompt-side]. The flows I want while the app sits in the background and I drive it from Claude Desktop: "summarise my unread", "which need me today", "draft replies to the top 3", "clear the newsletters". These mostly compose the tools above — the work is making sure the pieces exist and chain cleanly.

---

## Out of scope / would need external access (not recommended for now)

- [ ] **claude.ai (browser) connector** — needs a *hosted* MCP server with OAuth, not a local one.
- [ ] **Server-side vacation responder / server filters** — needs Sieve/provider support.
- [ ] **Push (IMAP IDLE) for instant new-mail** — doable locally-ish but adds a long-lived connection; medium risk. (Current model is periodic sync.)
- [ ] **Machine translation, calendar free/busy, contact photos/Gravatar, link previews** — all pull from third-party services.
- [ ] **PGP/S-MIME encryption** — possible locally but heavy; only worth it if I actually exchange signed mail.
