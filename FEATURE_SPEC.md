# DeskMail AI — Feature Specification

Behaviour for every feature, the full data model, and MCP tool shapes. Pair this with the visual
system in `design-files/Style Guide.dc.html` and the interactive reference in
`design-files/DeskMail AI.dc.html`.

---

## Layout system

**Reading pane:** right · bottom · left · hidden (when hidden, selecting a message shows no preview).
**Sidebar:** left/right; modes expanded · compact · icons-only · hidden; contains accounts, folders,
custom views, system folders.
**Claude panel:** right slide-over · left slide-over · floating · docked · hidden.
**Message opening:** single-click selects (shows in reading pane if visible); double-click opens in a
separate BrowserWindow. Settings: "always open in full window" and "only use reading pane".

**Presets:**
- **Classic** — sidebar left · list centre · reading right · Claude hidden until opened.
- **Bottom Preview** — sidebar left · list top · reading bottom.
- **Focus Mode** — sidebar collapsed · list left · large reading centre · Claude as slide-over.
- **Wide Monitor** — sidebar left · list · large reading · Claude docked right.
- **Right Sidebar** — list left · reading centre · folders/accounts sidebar right.
- **No Reading Pane** — sidebar + list only; messages open by double-click in their own windows.

**Persisted layout preferences:** `readingPanePosition, readingPaneVisible, sidebarPosition,
sidebarMode, messageListDensity, messageListStyle, previewLineCount, openEmailBehaviour,
claudePanelPosition, selectedLayoutPreset, theme`. Changing a preference updates the UI immediately
and persists across launches. **Default theme = light.** Keep layout state separate from email data.

**View Settings screen:** preset cards with visual previews + fine-tune controls; strongly typed;
approachable, not technical.

---

## Full email window
Loads a message by ID; shows subject, sender, recipients, date, body, attachments, action buttons.
Multiple windows may be open, each independent from the main window; uses the same sanitisation as
the reading pane; must not expose Node APIs.
Actions: Reply, Reply all, Forward, Archive, Delete, Star, Mark unread, Print, Close.
Claude actions: Summarise · Draft reply · Explain simply · Extract key details · Extract dates &
deadlines · Find related emails · Turn into task.

## Reading pane
Toolbar (reply/reply-all/forward/archive/delete/star/mark-unread), "Open in window", "Ask Claude".
Remote-image block banner with a "Load images" affordance. Invite card (below) when the message is a
calendar invite. Attachments listed, never auto-opened.

## Account setup wizard
Fields: display name, email, incoming type (IMAP/POP3), incoming host/port/security, SMTP host/port/
security, username, password. Buttons: Test incoming, Test outgoing, Save. Connection states:
Testing… · Incoming OK · Outgoing OK · Authentication failed · Server settings incorrect · Account
added.

## Compose
From-account selector, To, Cc, Bcc, Subject, body editor, attachments, Save draft, Send. Claude
rewrite options: Make clearer · Warmer · More professional · Shorten · Expand · Fix spelling &
grammar. **Signature** inserted from the active account's signature. **Send is a manual action only.**

## Custom view builder
Smart views with match-all / match-any conditions; add condition; save; preview results. Example
views: from account · unread · has attachments · from specific senders · contains keywords · needs
reply · last 7 days · invoices/quotes/payments.

## Settings sections
Accounts · Folders · Sync · Sending · Claude connector · Appearance · Layout · Security · Privacy ·
Local storage · About. **Claude connector** shows: connector status, local MCP server status,
available tools, permissions, read-only / draft-only mode, and how to connect Claude Desktop.
**Local storage** holds Back up now / Restore (see packaging brief).

---

## Calendar & meetings
Month view with colour-coded events (per calendar and per meeting provider). New Event modal: title,
day/start/end, meeting provider (Microsoft Teams · Google Meet · Zoom · In person · Custom link),
guests, location, notes. Choosing a video provider generates a join link and launches the installed
desktop app when joining (falls back to the browser link); custom link accepts any URL.
**Email invites** render an invite card (title, date/time, provider, organiser, guests) with Accept
/ Tentative / Decline — **Accept adds the event to the calendar**.

---

## Added power features (Stage 8)

1. **Per-account signatures.** Each account has its own signature (`signatures` table, keyed by
   `account_id`, with an `is_default` and optional per-context variants). Compose inserts the
   signature for the selected From account; editable in Settings → Signatures with a live preview and
   an "append to new messages" toggle. First-person, British-English default text.

2. **Send-later & undo-send.** Compose offers "Send later" (pick a date/time → row in
   `scheduled_sends`; the background service sends at the scheduled time, still counts as a
   user-initiated send). Every send shows a brief **Undo** window (configurable delay, e.g. 5–30s)
   before it actually leaves the outbox. Scheduled sends are listed and cancellable.

3. **Snooze / remind-me.** Snooze a message to hide it from the inbox until a chosen time (`snoozes`
   table); it returns to the top of the inbox when due, with a subtle "snoozed" affordance.
   Quick options (Later today, Tomorrow, This weekend, Next week, Pick date).

4. **Canned reply templates.** Reusable message templates (`templates` table: name, subject, body,
   optional placeholders). Insert into Compose from a "Templates" control; manage in Settings.
   Seed a few in Jamie's voice (e.g. commission enquiry reply, licensing reply, dispatch note).

5. **Contacts / address book.** `contacts` table (name, email(s), org, notes, avatar colour).
   Auto-collect senders/recipients; autocomplete in To/Cc/Bcc; a Contacts view to browse/edit; link
   a contact to their recent mail.

6. **Unified "Today" agenda.** A single view combining today's calendar events with mail that needs
   attention (unread + "needs reply" + due snoozes + deadlines), in time order — the first thing the
   owner sees to plan the day. Reachable from the sidebar / a Today tab.

Style all of these strictly from the Style Guide; they should feel native to the app, not bolted on.

---

## Data model (columns)

**accounts:** id, display_name, email_address, incoming_type, incoming_host, incoming_port,
incoming_security, outgoing_host, outgoing_port, outgoing_security, username, created_at, updated_at.
(Credentials are **not** stored here — they go in OS secure storage keyed by account id.)

**folders:** id, account_id, name, role, remote_path, unread_count, total_count.

**messages:** id, account_id, folder_id, remote_uid, message_id_header, from_name, from_email,
to_json, cc_json, bcc_json, subject, snippet, body_text, body_html, received_at, sent_at, is_read,
is_starred, has_attachments, raw_path, created_at, updated_at.

**attachments:** id, message_id, filename, mime_type, size, local_path, downloaded_at.

**drafts:** id, account_id, to_json, cc_json, bcc_json, subject, body, created_by, in_reply_to_
message_id, created_at, updated_at.  *(`created_by` distinguishes user vs. Claude-created drafts.)*

**labels:** id, name, colour. **message_labels:** message_id, label_id.

**sync_state:** id, account_id, folder_id, last_uid, last_sync_at, sync_status, sync_error.

**layout_preferences:** id, reading_pane_position, reading_pane_visible, sidebar_position,
sidebar_mode, message_list_density, message_list_style, preview_line_count, open_email_behaviour,
claude_panel_position, selected_layout_preset, theme, updated_at.

**app_settings:** key/value (or typed columns) for global settings incl. default meeting provider,
launch-desktop-app toggle, undo-send delay, portable-mode flag.

**Additions:**
- **signatures:** id, account_id, name, body, is_default, created_at, updated_at.
- **scheduled_sends:** id, draft_id/account_id, send_at, status, created_at.
- **snoozes:** id, message_id, snooze_until, created_at.
- **templates:** id, name, subject, body, created_at, updated_at.
- **contacts:** id, name, emails_json, org, notes, avatar_colour, last_seen_at.
- **events:** id, title, day/date, start, end, provider, location, join_url, notes, calendar,
  created_at, updated_at.
- **event_attendees:** event_id, name, email, response.

Use migrations.

---

## MCP tool shapes (safe subset only)

- **list_accounts** → `[{id, display_name, email_address, colour, status}]`
- **list_folders** (`account_id?`) → `[{id, account_id, name, role, unread_count, total_count}]`
- **search_emails** (`query, account_id?, folder_id?, date_from?, date_to?, unread_only?,
  has_attachments?, limit`) → `[{message_id, sender, subject, date, snippet, account_id, folder_id,
  has_attachment}]`
- **read_email** (`message_id`) → `{message_id, sender, recipients, subject, date, body_text,
  attachments[], labels[], account_id, folder_id}`
- **create_draft** (`account_id, to, cc?, bcc?, subject, body, in_reply_to_message_id?`) →
  `{draft_id, status, created_at}` — visible to the user in the app.
- **find_related_emails** (`message_id, limit`) → `[{message_id, subject, sender, date, snippet,
  reason_for_match}]`
- **find_unanswered_emails** (`account_id?, limit`) → messages received but not replied to.
- **extract_dates_and_deadlines** (`message_id`) → `{dates[], deadlines[], suggested_tasks[],
  confidence}`
- **summarise_thread_data** (`message_id`) → `{thread_summary, key_points[], open_questions[],
  suggested_next_actions[]}`

**Forbidden for Claude:** send email, permanently delete, access passwords/credentials, access files
outside approved storage, modify account settings, bypass user approval. Draft creation is always
surfaced to the user; sending is always a manual, in-app action.

---

## Security requirements
Sanitise all email HTML before display · block remote images by default with a warning before
loading · never execute email scripts · email content cannot reach Node APIs · attachments never
auto-open · credentials in OS secure storage, never plain text · draft creation visible to the user ·
sending is manual only · MCP actions permission-limited.
