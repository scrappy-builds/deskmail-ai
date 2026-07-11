# Security

DeskMail AI handles your email and your mail-server password, so here is an honest
account of how it protects them and what it does **not** protect against.

## The short version

- **Local-only.** Your mail is fetched from your own mail server and cached in a local
  SQLite database on your PC. It is never sent to any third party. There is no account,
  no sign-up, and no telemetry.
- **Your password is encrypted** at rest in the operating-system keychain (Windows DPAPI
  via Electron `safeStorage`). It is never written to the database in plain text and is
  never exposed to the Claude/MCP connector.
- **The Claude connector is read-and-draft only.** It cannot send mail, permanently
  delete anything, read your password, or touch files outside DeskMail's own storage.

## Threat model / what is *not* protected

- **The cached mail is not encrypted at rest.** The local SQLite database contains the
  full text of your synced mail in the clear. Anyone who can read files under your
  Windows user account (malware running as you, someone at your unlocked machine, a disk
  image) can read your mail. Your Windows user account and disk encryption (BitLocker)
  are the real boundary. Full at-rest encryption of the database is a roadmap item.
- **Single user, single machine.** No multi-user isolation. Anyone using your Windows
  session is treated as you.
- **The installer is unsigned.** There is no code-signing certificate, so Windows
  SmartScreen warns about an "unknown publisher" on first run. Verify you downloaded it
  from the official source.
- **Network trust.** DeskMail connects to the mail servers you configure using the
  security you choose (SSL/TLS recommended). It does not pin certificates.
- **Password (basic-auth) login only.** There is no OAuth. Providers that require it (or
  an app-specific password) need you to create an app password; DeskMail cannot broker
  OAuth on your behalf.

## Reporting a vulnerability

This is a personal project maintained on a best-effort basis. If you
find a security issue, please **open a private security advisory** on the GitHub
repository (Security → Report a vulnerability) rather than a public issue, so it can be
looked at before it's widely known. Include steps to reproduce and the impact. There is
no bug-bounty programme.

There is **no warranty** — see [LICENSE](LICENSE). Keep your own backups.
