# DeskMail AI — Testing & Limitations

An honest account of what's been tested, what's been fixed, and what the known
limitations are. Being upfront about trade-offs is deliberate.

> **New to this?** The short version: the core mail engine has been tested against
> a real mail server and works — sending, receiving, folders, flags, large
> mailboxes, and instant new-mail all verified. The main things it does *not* do
> yet are listed under [Known limitations](#known-limitations).

---

## Automated tests

- **349 unit tests** (`npm test`) covering the sync planners, database layer, mail
  actions, junk/rules/focus classifiers, MCP tool surface, connection-error
  classification, provider presets, and more.
- **End-to-end tests** (`npm run test:e2e`, Playwright driving the built Electron
  app) covering account setup, drafts, and folder sync.

## Verified against a real IMAP/SMTP server

The full mail engine was shaken out against a real Dovecot mail server (a cPanel
mailbox on a custom domain), driving the built app through its own bridge and
checking results independently over IMAP:

| Area | Result |
|---|---|
| Account connect + login | ✅ |
| Multi-folder sync (Inbox, Sent, Archive, …) | ✅ |
| Prefixed-namespace folders (`INBOX.Sent`, common on self-hosted mail) | ✅ |
| Back-fill / "Load older" (deep history) | ✅ |
| Incremental sync of new mail | ✅ |
| Read/unread pushed to the server | ✅ |
| Star/flag push (both directions) | ✅ |
| Server → app reconcile (read/starred/deleted elsewhere) | ✅ |
| Move / Archive / Trash pushed to the server | ✅ |
| Permanent delete (expunge) | ✅ |
| Sending mail (SMTP) + Sent copy saved | ✅ |
| Instant new mail via IMAP IDLE (push) | ✅ (arrived in ~3s, no manual sync) |
| Large mailbox: 10,000+ messages | ✅ (see below) |

### Large-mailbox / performance results

Tested with a seeded inbox of **10,000+ messages including large attachments**
(~170 MB local database):

- **Reading & search stay fast** — listing 10k messages ~0.4s, search effectively
  instant.
- **Local database size ≈ mailbox size**, because DeskMail caches each message's
  full source (a mailbox with many large attachments will produce a large local DB).
- **First sync is instant** (newest 50), then the rest **back-fills in the
  background** — a full 10k mailbox in ~5 minutes, once (it doesn't re-do it).

## Fixed & improved during real-server testing

These were found by testing against a real server and are fixed:

1. **Duplicate folders** on prefixed-namespace servers (`INBOX.Sent` etc.) — the app
   made a second "Sent"/"Trash" and could route actions to the wrong one.
2. **Read/unread never reached the server** — it was written locally only.
3. **"Sync now" could miss brand-new mail** on a kept-alive connection (stale mailbox
   view); now forces a fresh check.
4. **O(n²) back-fill on large mailboxes** — a missing database index made importing a
   big mailbox slow down as it grew; now a flat, fast import.
5. **Triage ran on historical mail** — junk/rules/focus were applied to old mail being
   imported (a correctness smell and half the import cost); now they run only on
   genuinely new mail. This also **roughly halved** back-fill time.
6. **Installer build was broken** — packaging (`npm run package`) failed compiling the
   NSIS uninstaller; fixed, and the Windows installer now builds.

---

## Known limitations

These are deliberate omissions or things not yet done. None are blockers for
personal use; they're a roadmap.

- **Windows only.** macOS/Linux are not built or tested yet.
- **Password (basic-auth) login only — no OAuth.** Providers that require OAuth or
  an app-specific password (Gmail, iCloud, Yahoo, and increasingly personal
  Outlook/Hotmail) need an **app password** with two-factor auth enabled. Some
  personal Microsoft accounts may not connect at all until Microsoft's app-password
  path is used. The app and the Claude setup helper flag this.
- **Gmail's label model is untested.** In Gmail one message can appear in several
  "folders" at once (labels) and in `[Gmail]/All Mail`; DeskMail treats folders as
  distinct, so Gmail may show apparent duplicates. Not yet verified on a real Gmail
  account.
- **POP3 is not fully supported.** The wizard can reach a POP3 server, but sync is
  IMAP-only for now.
- **The local database is not encrypted at rest.** Your **password** is encrypted in
  the OS keychain, but the cached mail in the local SQLite file is not. Anyone with
  access to your Windows user account could read it.
- **The installer is unsigned.** There's no code-signing certificate, so Windows
  SmartScreen will warn on first run ("unknown publisher"). It's safe; that's just
  what Windows shows for apps without a paid certificate.
- **Single user, single machine.** No multi-user support, no sync of settings between
  machines (other than manual backup/restore).
- **The Claude connector cannot send or permanently delete.** By design — it can
  draft and organise, but sending and hard-deletes are always your action. (This is a
  feature, listed here so expectations are clear.)

---

## How to run the tests yourself

```bash
npm install
npm test           # unit tests
npm run test:e2e   # end-to-end (builds and drives the app)
npm run build      # production build
npm run package    # build the Windows installer
```
