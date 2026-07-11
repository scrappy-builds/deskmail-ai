# DeskMail AI — To-Do List

A running list of improvements, bug fixes, and changes. Newest requests added to
the bottom of each section. **When an item is done and verified it's removed from
this list**, so what's left is always the live backlog.

---

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
