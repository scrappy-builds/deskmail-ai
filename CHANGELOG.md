# Changelog

A short record of what's changed in each released version of DeskMail AI, newest first.

## 0.2.0 — 2026-07-13

- Your signature is no longer typed over by a long message — it stays at the bottom and the compose window scrolls, and attachments can't overlap it.
- Signature social icons are now sent so they display in the recipient's mail (older signatures are upgraded automatically).
- Added an Outlook-style address book: pick people straight from your contacts into To, Cc or Bcc.
- The app no longer crashes when an IMAP connection times out.
- Large attachments no longer get stuck in the Outbox.
- Remote images now load by default in the Inbox and every folder; only Junk blocks them, with one click to load.
- Drafts and Outbox now open inline like any other folder instead of as a pop-up.
- Reminders for repeating events now fire on every occurrence, and a duplicate reminder alert was removed.
- Find-in-message now works on plain-text emails, right-click actions can be undone, and the pop-out message window gained Edit-as-new, Save attachments, Export conversation and Custom snooze.
- Claude connector: added tools to create/list/delete filter rules, create tasks and list contacts.
- Claude connector: moving mail now gives a clear error instead of failing silently, and the app and Claude sharing one database no longer clash.

## 0.1.0 — 2026-07-11

- Initial public release: a local, single-user Windows email client (IMAP/SMTP with an offline SQLite cache) and a safe read-and-draft Claude connector.
