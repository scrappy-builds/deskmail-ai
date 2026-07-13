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

test('archiving a message removes it from the inbox and stars persist', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-act-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(800)
    const rows = win.locator('[data-testid^="msg-row-"]')
    await expect(rows).toHaveCount(7)

    // Archive the selected message via the command-bar ribbon. (name 'Archive'
    // also matches the sidebar Archive *folder*; the ribbon button is first in
    // the DOM, so .first() targets the action, not the folder.)
    await win.getByTestId('msg-row-4').click()
    await win.getByRole('button', { name: 'Archive' }).first().click()
    await expect(rows).toHaveCount(6)
    await expect(win.getByTestId('msg-row-4')).toHaveCount(0)

    // Flag another one; it moves to the DB and reflects in the store (isStarred).
    await win.getByTestId('msg-row-5').click()
    await win.getByRole('button', { name: 'Flag', exact: true }).click()
    await win.waitForTimeout(200)
    const starred = await win.evaluate(() => window.deskmail.mail.getMessage(5).then((m) => m?.isStarred))
    expect(starred).toBe(true)
  } finally {
    await app.close()
    safeRm(userData)
  }
})
