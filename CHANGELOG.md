# Changelog

A short record of what's changed in each released version of DeskMail AI, newest first.

## 0.2.3 — 2026-07-14

- Fixed a bug where a folder kept inside your Inbox could show up a second time as a stray copy outside the Inbox after reinstalling or updating. New syncs no longer create the duplicate, and any copy that already escaped is tidied back into the original folder automatically.
- Fixed the compose window so a long quoted email — when you reply to or forward a lengthy message — no longer overlaps or hides the signature area. The message area now takes its full height and the window scrolls, keeping everything in its own space.

## 0.2.2 — 2026-07-14

- Fixed a serious bug where the message you typed could be dropped when sending or saving. Replies were hit hardest — they could send with your text missing entirely. Your message now always sends exactly what's in the editor.
- Replies now show an "On <date>, <name> wrote:" line above the quoted message, so it's clear who and what you're replying to.
- Clear solid line between your message and the quoted thread, on both replies and forwards (replacing the old row of dashes on forwards).
- Your signature now sits directly under your message and above the quoted thread on replies and forwards, rather than at the very bottom of the whole chain.

## 0.2.1 — 2026-07-14

- When you reply or forward, your signature now sits directly under your message instead of below the whole quoted conversation.
- Reinstalling or updating no longer removes your pinned Start-menu or taskbar shortcut.
- Signature social icons now load from hosted images, so they display inline without showing up as attachments in the recipient's mail.
- Accepting a meeting invite that arrives without a standard calendar file (some Microsoft Teams invites) now works: DeskMail spots the join link in the email and offers to add it to your calendar.

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
