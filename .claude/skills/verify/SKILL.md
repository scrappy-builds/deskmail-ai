---
name: verify
description: How to build, launch and drive the DeskMail AI Electron app for end-to-end verification of a change.
---

# Verifying DeskMail AI changes

## Build + launch

```bash
npm run build            # electron-vite build → out/
```

Drive the built app with Playwright's Electron support (already a dev dependency).
From a Node .mjs script:

```js
import { createRequire } from 'node:module'
const { _electron: electron } = createRequire(join(process.cwd(), 'package.json'))('playwright')
const app = await electron.launch({
  args: [join(process.cwd(), 'out', 'main', 'index.js')],
  env: { ...process.env, DESKMAIL_USER_DATA: mkdtempSync(join(tmpdir(), 'deskmail-verify-')) }
})
const win = await app.firstWindow()
```

`DESKMAIL_USER_DATA` points the app at a throwaway data dir — always set it so runs
don't touch real mail. Relaunch with the same dir to test persistence.

## Driving gotchas

- Title-bar menus (File/Edit/View/…) are `<span>`s, not buttons — use
  `getByText('File', { exact: true })`, then menu items by text (`'Settings…'`).
- Settings modal: open via File → Settings…; close by clicking the backdrop
  (e.g. `win.mouse.click(8, 400)`), the ✕ has no accessible name.
- Buttons named `Delete`/`Edit` exist in the command bar *behind* modals too —
  never use bare `getByRole('button', { name: 'Delete' }).nth(n)`; scope to the
  card/row (xpath `//span[text()="…"]/parent::div//button[…]` works).
- `window.confirm` dialogs: register `win.on('dialog', d => d.accept())` and log
  `d.message()` — the message tells you which item the click really hit.
- The renderer bridge is available for state checks:
  `win.evaluate(() => window.deskmail.getSettings())`.
- Theme state lives on the root element: `data-theme` attribute + inline
  `--token` style vars.

## Worth driving

Theme/appearance: command-bar "Colour scheme" menu; Settings → Appearance
(cards, New theme editor, live preview, Cancel-restores, delete-confirm).
Native file dialogs (import/export/backup) can't be driven — verify around them.
