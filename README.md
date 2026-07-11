# DeskMail AI

A **local, single-user desktop email client for Windows** with a safe, built-in
Claude connector. Your mail is fetched from your own mail server and cached in a
local database on your PC; your password is encrypted by Windows. Nothing leaves
your machine except the connection to your own mail server and — only if you
choose — your own Claude.

> ### 👋 New to coding, Claude, or AI in general?
> This README is written for people who are comfortable with a terminal. **If that's
> not you, don't worry** — scroll down to **[For people new to all this](#for-people-new-to-all-this)**
> near the bottom. It explains what this is and how to run it in plain language, with
> no assumed knowledge.

---

## What it does

- Full **IMAP/SMTP** email: every folder, deep history, instant new-mail push (IDLE),
  two-way sync of reads/flags/moves/deletes.
- **Reading & organising**: folders, labels, pin/mute, snooze, follow-ups, rules,
  a learning junk filter, smart views, and an optional focused inbox.
- **Composing**: rich text, attachments, multiple signatures, templates, drafts,
  scheduled send, and undo-send.
- **Calendar & contacts**, search, an attachments browser, backup/restore.
- A **local Claude (MCP) connector** that can read, search, draft, and organise your
  mail — but **can never send, permanently delete, or read your password**. It can
  even **set up a mail account for you** (see below).

A full list is in **[FEATURES.md](FEATURES.md)**. What's been tested and the known
limitations are in **[TESTING_AND_LIMITATIONS.md](TESTING_AND_LIMITATIONS.md)**.

---

## Quick start (development)

**Prerequisites:** Windows 10/11, [Node.js](https://nodejs.org/) 20+ and Git.

```bash
git clone <your-fork-url>
cd "DeskMail AI"
npm install
npm run dev          # launch the app with hot reload
```

Other commands:

```bash
npm test             # unit tests
npm run test:e2e     # end-to-end tests (builds + drives the app)
npm run build        # production build into out/
npm run package      # build the Windows installer into release/
```

> **Install note:** this project avoids native compilation — `electron` is a plain
> download and the database is WebAssembly SQLite (`node-sqlite3-wasm`), so no build
> tools are required. If `node_modules/electron/dist` is empty after `npm install`,
> extract the cached zip from `%LOCALAPPDATA%\electron\Cache` into it.

**Prefer not to build it yourself?** Grab the ready-made Windows installer from the
[Releases](../../releases) page. (Because it isn't code-signed, Windows SmartScreen
shows an "unknown publisher" warning on first run — that's normal for apps without a
paid certificate.)

---

## Make it yours

The whole point of this app is that you can change it with Claude. See
**[docs/CUSTOMISING_WITH_CLAUDE.md](docs/CUSTOMISING_WITH_CLAUDE.md)** for worked
examples ("give it a dark-blue theme", "add a shortcut to archive", "change the
reading pane"), each written as *what to type to Claude* and *how to see it working*.

If you're editing the code with Claude Code, the root **[CLAUDE.md](CLAUDE.md)** tells
Claude how the app is put together and the rules to follow.

---

## Connect Claude Desktop (local MCP server)

DeskMail ships a **local MCP server** so Claude Desktop (or Claude Code) can safely
**search, read, summarise, draft, and organise** your mail, and **set up accounts**.
It exposes only these tools:

- Read/draft: `list_accounts`, `list_folders`, `search_emails`, `read_email`,
  `create_draft`, `find_related_emails`, `find_unanswered_emails`,
  `extract_dates_and_deadlines`, `summarise_thread_data`.
- Organise (all reversible): `move_email`, `archive_email`, `delete_email` (to Trash),
  `flag_email`, `mark_email_read`, `label_email`, `snooze_email`, `set_followup`.
- Overview & insight: `inbox_overview`, `triage_priority`, `get_daily_digest`,
  `suggest_rules`, `get_unsubscribe_info`, `get_sent_context`.
- **Account setup:** `suggest_mail_config` (look up a provider's settings),
  `stage_account_setup` (fill in the Add-account form for you — never the password),
  `check_account_setup` (confirm it connected).
- Export: `export_for_notebooklm`.

**It can never** send email, **permanently** delete anything, read your credentials,
or touch files outside DeskMail's own storage. `delete_email` only moves to Trash;
drafts are stored locally in the **Drafts** view for you to review and send yourself.

**To connect:** open **Settings → Claude connector** in DeskMail and copy the
generated config into Claude Desktop's `claude_desktop_config.json` (Claude Desktop →
Settings → Developer → Edit Config), then restart Claude Desktop.

### Have Claude set up an account for you

Ask Claude Desktop something like *"set up my iCloud email in DeskMail."* Claude looks
up the right server settings, fills in the Add-account form in the app for you, and
tells you to type your password, run the connection test, and save. **Claude never
asks for or sees your password** — you enter only that.

---

## Licence

**PolyForm Noncommercial License 1.0.0** — see [LICENSE](LICENSE).

In plain English: **free for personal, non-commercial use.** You can run it, read the
code, change it, and share it. You **can't sell it** or use it commercially without
permission. The copyright is retained by the author, so separate commercial licences
can be granted.

Third-party dependency licences are listed in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

**No warranty.** This software touches your mail and passwords. It comes **as-is, with
no warranty**, and the author is **not liable** for any loss or damage from using it.
Use at your own risk, and keep your own backups. See [SECURITY.md](SECURITY.md) for the
honest threat model.

---

## For people new to all this

If words like "terminal", "repo", "Node" or "MCP" mean nothing to you, this section is
for you. Nothing here assumes you can code.

**What is DeskMail AI?**
It's an email program you run on your own Windows computer — like Outlook or the Mail
app, but it keeps your emails on *your* machine and lets an AI assistant (Claude) help
you with them safely.

**Why would I want it?**
- Your email stays private, on your computer. It doesn't phone home.
- Claude can read and tidy your mail and write draft replies for you — but it can
  **never** send anything or delete anything for good on its own. You're always in
  control.
- You can change how it looks and works just by *asking Claude*, even if you've never
  written a line of code.

**What is Claude / Claude Desktop / Claude Code?**
Claude is an AI assistant made by Anthropic. "Claude Desktop" is the Claude app you
install on your computer. "Claude Code" is a version that can edit files and code for
you. DeskMail can connect to either so the AI can help with your email or change the app.

**What is an "app password"?**
Big email providers (Gmail, iCloud, Outlook, Yahoo) often won't let another app log in
with your normal password for safety. Instead you create a special one-time "app
password" in your email account's security settings and use that. It's like cutting a
spare key that only works for one gadget. If you ask Claude to set your account up, it
will tell you when you need one and where to get it.

**How do I actually get it running?**
The easiest way, if you don't code:
1. Go to the **Releases** page of this project (the link is near the top of this page).
2. Download the Windows installer (a file ending in `.exe`).
3. Run it. Windows may warn that the publisher is unknown — that's expected for a free
   app like this; choose "More info" → "Run anyway" if you're comfortable.
4. Open DeskMail, and either add your email by hand or ask Claude to set it up for you.

If you *do* want to run it from the source code, follow **[Quick start](#quick-start-development)**
above — and if a step is confusing, paste it into Claude and ask it to walk you through
it on your computer.

**Is it safe?**
Your mail and password stay on your PC. The one honest caveat: the local copy of your
mail is **not encrypted on disk** (your password is), so treat your Windows account as
the lock on the door. More detail is in [SECURITY.md](SECURITY.md).
