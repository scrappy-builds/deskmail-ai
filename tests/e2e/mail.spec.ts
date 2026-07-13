import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

function launch(userData: string, seed: boolean): Promise<ElectronApplication> {
  const env: NodeJS.ProcessEnv = { ...process.env, DESKMAIL_USER_DATA: userData }
  if (seed) env.DESKMAIL_SEED_DEMO = '1'
  return electron.launch({ args: [MAIN], env })
}
function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

test('sanitises the body, strips scripts, and loads images in the inbox', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mail-'))
  const app = await launch(userData, true)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(800)

    // The first demo email carries a tracking pixel and a <script>.
    await win.getByTestId('msg-row-1').click()
    await expect(win.getByRole('heading', { name: /Q3 launch timeline/ })).toBeVisible()

    // Body renders inside the sandboxed iframe.
    const body = win.frameLocator('iframe[title="Message body"]').locator('body')
    await expect(body).toContainText('updated launch plan')

    // Security: the <script> never survives and nothing runs — regardless of images.
    const inner = await body.innerHTML()
    expect(inner.toLowerCase()).not.toContain('<script')
    expect(await win.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned === true)).toBe(false)

    // Inbox mail loads remote images by default — no blocked-images banner.
    await expect(win.getByText(/blocked remote images/i)).toHaveCount(0)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('blocks remote images only in Junk, with an opt-in', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mail-'))
  const app = await launch(userData, true)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(800)

    // Open the Junk folder and the auto-filtered spam message (it has a tracker pixel).
    await win.getByRole('button', { name: 'Junk' }).click()
    await win.getByRole('heading', { name: /gift card/i }).waitFor().catch(() => undefined)
    await win.locator('[data-testid^="msg-row-"]').first().click()

    // Remote images are blocked here, with a one-click opt-in.
    await expect(win.getByText(/blocked remote images/i)).toBeVisible()
    await win.getByRole('button', { name: 'Load images' }).click()
    await expect(win.getByText(/blocked remote images/i)).toHaveCount(0)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('reads mail from the local cache offline (persists, no reseed)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mail-'))
  // First run seeds the cache.
  let app = await launch(userData, true)
  let win = await app.firstWindow()
  await win.waitForTimeout(800)
  await expect(win.getByTestId('msg-row-1')).toBeVisible()
  await app.close()

  // Relaunch WITHOUT the seed flag — data must come from the SQLite cache.
  app = await launch(userData, false)
  try {
    win = await app.firstWindow()
    await win.waitForTimeout(800)
    await expect(win.getByTestId('msg-row-1')).toBeVisible()
    await win.getByTestId('msg-row-2').click()
    await expect(win.getByRole('heading', { name: /Your invoice for June/ })).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
