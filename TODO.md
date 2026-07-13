# DeskMail AI — To-Do List

A running list of improvements, bug fixes, and changes. Newest requests added to
the bottom of each section. **When an item is done and verified it's removed from
this list**, so what's left is always the live backlog.

---

## Backlog

- [ ] **Reinstalling wipes the pinned Start / desktop shortcut (reported 2026-07-13).**
  Each reinstall/update runs the NSIS uninstaller first, which deletes the Start-menu
  and desktop shortcuts, then recreates them at the end — but Windows drops a *pinned*
  Start shortcut when the file it points at is removed, so the pin is lost every time.
  Look at the electron-builder `nsis` config (`electron-builder.yml`): options like
  `deleteAppDataOnUninstall: false`, a custom NSIS `include`/`installer.nsh` that leaves
  existing shortcuts in place when they already exist (or re-pins after install), or a
  stable AppUserModelID + install path so the pin survives. Ideal outcome: an in-place
  update that never removes the user's existing shortcut/pin.

## Future / roadmap

- [ ] **Real video-meeting integration.** Build proper Teams, Google Meet and Zoom
  integration so creating an event can generate a genuine meeting on that service
  (needs each provider's API/OAuth). Until then the New Event modal only offers
  "In person" and "Custom link" (paste your own), and DeskMail still recognises +
  joins real Teams/Meet/Zoom links that arrive inside received invites.
