# DeskMail AI — To-Do List

A running list of improvements, bug fixes, and changes. Newest requests added to
the bottom of each section. **When an item is done and verified it's removed from
this list**, so what's left is always the live backlog.

---

## Backlog

_(Empty — the improvements batch below is done, verified, and shipped on
`feature/improvements-batch`.)_

### Known follow-ups / polish

Minor gaps left after the improvements batch — none blocking, worth a tidy-up
pass later:

- **Reminder alert overlap.** A pre-existing "starts within 10 min" toast
  (`checkEventReminders`) still runs alongside the new per-entry reminders, so an
  entry with `reminderMinutes ≈ 10` can alert twice. Decide whether to retire the
  old generic toast now that explicit reminders exist.
- **Find-in-message is HTML-only.** The Ctrl+F find bar works on HTML email
  bodies (the common case) but not plain-text-only emails.
- **Standalone message window parity.** The new actions (Edit as new, Save
  attachments, conversation export, custom snooze) live on the main-window action
  ribbon / reading pane; the pop-out message window doesn't have all of them yet.
- **Right-click menu has no Undo.** The message right-click menu performs
  move/delete/archive without recording an Undo, unlike the command-bar ribbon.
- **Per-occurrence reminders.** A recurring entry fires its reminder once off the
  base date, not per occurrence.

## Future / roadmap

- **PDF guides (User Guide + Connector Guide).** Dropped from v1 — the generator
  (`scripts/build-guides.mjs`) is out of date with the current UI (compose is now
  its own window; several highlighted controls moved) and its demo content carried
  brand references. The README's connector walkthrough + screenshots and
  `docs/CUSTOMISING_WITH_CLAUDE.md` cover setup for now. To bring the PDFs back:
  update the generator for the current UI, neutralise the demo content, and add an
  ELI5 section.

- **Real video-meeting integration.** Build proper Teams, Google Meet and Zoom
  integration so creating an event can generate a genuine meeting on that service
  (needs each provider's API/OAuth). Until then the New Event modal only offers
  "In person" and "Custom link" (paste your own), and DeskMail still recognises +
  joins real Teams/Meet/Zoom links that arrive inside received invites.
