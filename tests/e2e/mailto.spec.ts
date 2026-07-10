import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

async function waitForComposeWindow(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    const w = app.windows().find((p) => p.url().toLowerCase().includes('compose'))
    if (w) {
      await w.waitForLoadState('domcontentloaded')
      return w
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('compose window did not open')
}

test('launching with a mailto: argument opens Compose prefilled', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mailto-'))
  // The mailto URL is passed as a launch argument, exactly as Windows would.
  const app = await electron.launch({
    args: [MAIN, 'mailto:hello@example.com?subject=Quote%20request&body=Hi%20Jamie'],
    env: { ...process.env, DESKMAIL_USER_DATA: userData, DESKMAIL_SEED_DEMO: '1' }
  })
  try {
    await app.firstWindow()
    const cmp = await waitForComposeWindow(app)
    await expect(cmp.getByText('hello@example.com')).toBeVisible()
    await expect(cmp.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Quote request')
    await expect(cmp.locator('.ProseMirror')).toContainText('Hi Jamie')
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('the "Use DeskMail for email links" toggle is present and off by default', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mailto-'))
  const app = await electron.launch({ args: [MAIN], env: { ...process.env, DESKMAIL_USER_DATA: userData, DESKMAIL_SEED_DEMO: '1' } })
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(500)

    // Default is off — we don't hijack email links without opt-in.
    expect(await win.evaluate(() => window.deskmail.mailto.enabled())).toBe(false)

    // The control lives in Settings → Accounts, with honest Windows copy.
    await win.getByText('File', { exact: true }).click()
    await win.getByText('Settings…').click()
    const row = win.getByText('Use DeskMail for email links')
    await expect(row).toBeVisible()
    await expect(win.getByText(/won.t let any app take this over silently/)).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
