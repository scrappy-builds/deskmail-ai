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

test('spam is auto-moved to Junk and can be marked not junk', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-junk-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(900)

    // The spam email never appears in the inbox (7 legit messages remain).
    const rows = win.locator('[data-testid^="msg-row-"]')
    await expect(rows).toHaveCount(7)
    await expect(win.getByText(/YOU WON a \$1000/i)).toHaveCount(0)

    // It's in the Junk folder.
    await win.getByRole('button', { name: 'Junk' }).click()
    await expect(rows).toHaveCount(1)
    await win.getByTestId(await rows.first().getAttribute('data-testid') ?? '').click()
    await expect(win.getByRole('heading', { name: /YOU WON a \$1000/i })).toBeVisible()

    // "Not junk" sends it back to the inbox.
    await win.getByRole('button', { name: 'Not junk' }).click()
    await expect(rows).toHaveCount(0) // gone from Junk
  } finally {
    await app.close()
    safeRm(userData)
  }
})
