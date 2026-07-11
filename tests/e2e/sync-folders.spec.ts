import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [MAIN], env: { ...process.env, DESKMAIL_USER_DATA: userData, DESKMAIL_SEED_DEMO: '1' } })
}
function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

// Full sync pulls every folder, not just the Inbox. The demo seed populates Sent
// and Archive, so opening those folders must show their mail. (The UID-cursor /
// back-fill mechanics are covered at the imapflow boundary in the unit suite;
// the packaged app has no live server to drive them here.)
test('mail in non-INBOX folders appears when you open them', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-syncf-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)
    // Inbox is the default view.
    await expect(win.getByTestId('msg-row-1')).toBeVisible()

    // Open Sent → the sent demo message shows.
    await win.getByTestId('folder-sent').click()
    await expect(win.getByText('Licence terms for the radiator clip (printed units)')).toBeVisible()

    // Open Archive → the archived demo message shows.
    await win.getByTestId('folder-archive').click()
    await expect(win.getByText('Confirmation statement filed')).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
