import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

// Windows can briefly hold a lock on userData after the app closes; temp cleanup
// is best-effort and never part of the assertion.
function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* the OS clears its temp dir eventually */
  }
}

function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [MAIN],
    env: { ...process.env, DESKMAIL_USER_DATA: userData }
  })
}

test('boots, is locked down, and persists the theme toggle', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-e2e-'))
  try {
    // --- First launch -------------------------------------------------------
    let app = await launch(userData)
    let win = await app.firstWindow()

    // Shell is present.
    await expect(win.getByText('DeskMail', { exact: false }).first()).toBeVisible()

    // Security: the renderer must have no Node access, only the typed bridge.
    const sec = await win.evaluate(() => ({
      hasRequire: typeof (window as unknown as { require?: unknown }).require,
      hasProcess: typeof (window as unknown as { process?: unknown }).process,
      hasBridge: typeof window.deskmail
    }))
    expect(sec.hasRequire).toBe('undefined')
    expect(sec.hasProcess).toBe('undefined')
    expect(sec.hasBridge).toBe('object')

    // Default theme is light.
    await expect
      .poll(() => win.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('light')

    // Toggle to dark.
    await win.getByRole('button', { name: 'Toggle theme' }).click()
    await expect
      .poll(() => win.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')

    await app.close()

    // --- Relaunch: theme should have persisted ------------------------------
    app = await launch(userData)
    win = await app.firstWindow()
    await expect
      .poll(() => win.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')
    await app.close()
  } finally {
    safeRm(userData)
  }
})

test('layout preset selection persists across relaunch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-e2e-'))
  try {
    let app = await launch(userData)
    let win = await app.firstWindow()

    // Default preset is Classic.
    await expect.poll(() => win.evaluate(() => window.deskmail.getSettings().then((s) => s.selectedLayoutPreset))).toBe('classic')

    // Switch to Focus Mode via View Settings.
    await win.getByRole('button', { name: 'View settings' }).click()
    await win.getByRole('button', { name: /Focus Mode/ }).click()
    await win.getByRole('button', { name: 'Done' }).click()
    await expect.poll(() => win.evaluate(() => window.deskmail.getSettings().then((s) => s.selectedLayoutPreset))).toBe('focus')

    await app.close()

    // Relaunch: the preset should have been restored.
    app = await launch(userData)
    win = await app.firstWindow()
    await expect.poll(() => win.evaluate(() => window.deskmail.getSettings().then((s) => s.selectedLayoutPreset))).toBe('focus')
    await app.close()
  } finally {
    safeRm(userData)
  }
})
