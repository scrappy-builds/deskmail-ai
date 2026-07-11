# DeskMail AI — Features

A complete list of what DeskMail AI does today. It's a **local, single-user desktop
email client** for Windows: your mail lives on your PC in a local database, your
password is encrypted by Windows, and nothing leaves your machine except the
connection to your own mail server and (optionally) your own Claude.

> **New to all this?** Skip to [Explain like I'm five](#explain-like-im-five) at
> the bottom — it describes every feature in plain language with no jargon.

---

## Mail accounts & sync

- **IMAP accounts** — add any number of mailboxes (Gmail, Outlook/Hotmail, iCloud,
  Yahoo, Fastmail, your own domain, etc.) with username + password.
- **Guided setup with connection test** — the Add-account wizard tests the incoming
  (IMAP) and outgoing (SMTP) servers before saving, and tells you plainly if the
  host, port, or password is wrong.
- **Claude-assisted setup** *(new)* — ask Claude Desktop to set an account up for
  you. It knows the settings for the common providers (and sensible defaults for a
  custom domain), fills in the whole form for you, and never asks for or sees your
  password — you type only that, run the test, and save.
- **Full multi-folder sync** — every folder, not just the inbox. Newest 50 shown
  instantly, then older mail back-fills in the background with a **"Load older"**
  button, down to a configurable history depth.
- **Two-way sync** — read/unread, starred, moves, archive, and deletes all push
  back to the server; changes made elsewhere (phone, webmail) reconcile back.
- **Instant new mail (IMAP IDLE)** — the server pushes new mail to DeskMail the
  moment it arrives; a periodic poll is the fallback.
- **Multiple accounts, unified inbox** — see all inboxes together or per-account.

## Reading & organising

- **Folders** — standard mailboxes plus your own custom folders, nested, drag-to-reorder.
- **Labels** — colour-coded, multiple per message.
- **Pin & mute** conversations.
- **Snooze** a message until later; **follow-up** flags with a due date.
- **Smart Views** — saved searches that act like virtual folders.
- **Focused inbox** — learns to split important mail from the rest (off until trained).
- **Rules** — auto-move, label, or junk incoming mail by sender/subject/etc.
- **Junk filter** — a local Bayesian spam filter that learns from what you mark.
- **Reading pane** with safe HTML rendering, remote-image blocking, and sender
  signal banners (first contact / look-alike / reply-to mismatch).
- **Print a message to PDF**, save as `.eml`/`.html`, open the raw source.

## Composing & sending

- **Rich text composer** with attachments.
- **Multiple signatures** per account (rich HTML), auto-appended if you choose.
- **Templates** for canned replies.
- **Drafts** saved locally.
- **Scheduled send** (send later) and **undo send** (a configurable delay window).
- **Outbox** with retry for failed sends.

## Calendar & meetings

- **Local calendar** with events.
- **Meeting invites** — accept/decline `.ics` invitations from mail; send invites.
- **"Today" agenda** — today's events plus mail that needs attention.

## Contacts

- **Contact list** built from your mail, with groups.
- **Import/export vCard (`.vcf`)**.

## Search & attachments

- **Fast full-text search** across cached mail (sub-second even on tens of thousands
  of messages).
- **Attachments browser** — every attachment across all mail in one place.

## Customisation

- **Theme / appearance editor** — change accent colour and full colour scheme, with
  a live preview; make and save your own themes. Light and dark.
- **Keyboard shortcuts** — a master on/off toggle and a remappable key for each action.
- **Default email app / `mailto:` links** — register DeskMail as the handler for
  email links (Windows then asks you to confirm it as default — no app can do that
  silently on Windows 10/11, and the UI says so honestly).
- **Adjustable UI zoom, layout preferences, notification settings.**

## Privacy, storage & backup

- **Local-only** — mail is cached in a local SQLite database; credentials live in
  the OS keychain (encrypted by Windows). No telemetry, no accounts, no cloud.
- **Backup & restore** the local database; optional scheduled auto-backup.
- **De-duplicate** the local store; **attachment cache** size control.
- **Import/export** `.mbox` and `.eml`.

## Claude / MCP connector

DeskMail ships a **local MCP server** that Claude Desktop (or Claude Code) can
connect to. It is deliberately **read-and-draft only** — it can read, search,
draft, organise, and set up accounts, but it **cannot send mail, permanently
delete, or read your password**. Tools include:

- Read & search mail, list accounts/folders, inbox overview, triage priority.
- Draft replies (never sends — you review and send yourself).
- Organise: move/archive/flag/mark-read/label/snooze/follow-up (all reversible).
- Suggest rules, extract dates & deadlines, summarise threads, daily digest.
- Export a message for NotebookLM.
- **Account setup**: suggest mail settings, stage an account for you to finish,
  and confirm it connected — without ever handling your password.

---

## Explain like I'm five

Imagine an app on your computer that holds your email, like a filing cabinet in
your own house instead of in someone else's building.

- **It fetches your post.** You tell it your email address and password once, and it
  goes and gets all your emails and keeps copies on your computer so you can read
  them fast, even offline.
- **A robot helper can set it up for you.** If typing in server names sounds scary,
  you can ask Claude (the AI) to fill the form in for you. It knows the settings for
  Gmail, Outlook, iCloud and the rest. You just type your password at the end — the
  robot never sees it.
- **It keeps things tidy.** Folders, colours (labels), pinning important ones,
  hiding noisy ones, and a "snooze" button that makes an email come back later when
  you're ready for it.
- **It writes drafts, but never sends without you.** You can ask the AI to write a
  reply. It puts it in your drafts. Nothing is ever sent until *you* press send.
- **It blocks junk** and learns which mail is junk from the ones you tell it about.
- **It reminds you** about meetings and emails you still need to deal with.
- **You can repaint it.** Don't like the colours? Change them, or ask the AI to.
- **It's private.** Your emails stay on your computer. The app doesn't phone home,
  doesn't have a login, and doesn't send your mail anywhere except your own email
  company's servers (to fetch it) and, only if you choose, your own Claude.

That's it: your email, on your computer, tidy, private, and with an optional AI
helper that can read and draft but can't do anything risky on its own.
