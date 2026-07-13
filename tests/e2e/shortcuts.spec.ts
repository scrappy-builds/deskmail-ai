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

test('j/k navigate the list and Enter opens the selected message', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-sc-'))
  const app = await launch(userData)
  try {
    const main = await app.firstWindow()
    await main.waitForTimeout(600)
    await expect(main.locator('[data-testid^="msg-row-"]').first()).toBeVisible()

    // First 'j' selects the top row; Enter opens it in its own window.
    await main.keyboard.press('j')
    await main.keyboard.press('Enter')
    const w1 = await app.waitForEvent('window')
    await w1.waitForLoadState('domcontentloaded')
    const id1 = await w1.getByTestId('message-window').getAttribute('data-message-id')
    await w1.close()

    // 'j' again moves to the next row; Enter opens a different message.
    await main.keyboard.press('j')
    await main.keyboard.press('Enter')
    const w2 = await app.waitForEvent('window')
    await w2.waitForLoadState('domcontentloaded')
    const id2 = await w2.getByTestId('message-window').getAttribute('data-message-id')
    await w2.close()

    expect(id1).not.toBeNull()
    expect(id2).not.toBe(id1)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('rebinding Archive to a new key makes that key archive; the old key stops working', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-sc-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(600)
    const rows = win.locator('[data-testid^="msg-row-"]')
    await expect(rows).toHaveCount(7)

    // Settings → Shortcuts → rebind Archive (default 'e') to 'x' (an unused key —
    // 'a' is already the default for Reply-to-all, which would clash).
    await win.getByText('File', { exact: true }).click()
    await win.getByText('Settings…').click()
    await win.getByRole('button', { name: 'Shortcuts' }).click()
    await win.getByRole('button', { name: 'e', exact: true }).click() // the Archive key button
    await win.waitForTimeout(100)
    await win.keyboard.press('x')
    await expect(win.getByRole('button', { name: 'x', exact: true })).toBeVisible()

    // Close Settings (backdrop click) so App reloads the live keymap.
    await win.mouse.click(8, 8)
    await expect(win.getByText('Settings', { exact: true })).toHaveCount(0)

    // 'x' now archives; 'e' no longer does.
    await win.getByTestId('msg-row-4').click()
    await win.keyboard.press('e')
    await win.waitForTimeout(200)
    await expect(rows).toHaveCount(7) // old key is inert
    await win.keyboard.press('x')
    await expect(rows).toHaveCount(6)
    await expect(win.getByTestId('msg-row-4')).toHaveCount(0)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('turning the master toggle off disables every shortcut', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-sc-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(600)
    const rows = win.locator('[data-testid^="msg-row-"]')
    await expect(rows).toHaveCount(7)

    await win.getByText('File', { exact: true }).click()
    await win.getByText('Settings…').click()
    await win.getByRole('button', { name: 'Shortcuts' }).click()
    await win.getByRole('button', { name: /Keyboard shortcuts/ }).click() // toggle master off
    await win.mouse.click(8, 8) // close Settings

    // With shortcuts off, the archive key does nothing.
    await win.getByTestId('msg-row-4').click()
    await win.keyboard.press('e')
    await win.waitForTimeout(200)
    await expect(rows).toHaveCount(7)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('/ focuses search, ? opens the cheat-sheet, and typing in search does not navigate', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-sc-'))
  const app = await launch(userData)
  try {
    const main = await app.firstWindow()
    await main.waitForTimeout(600)
    await expect(main.locator('[data-testid^="msg-row-"]').first()).toBeVisible()

    // '/' focuses the search box.
    await main.keyboard.press('/')
    await expect(main.locator('#deskmail-search')).toBeFocused()

    // Typing 'j' inside search must not open a window — it's just text.
    await main.keyboard.type('jk')
    await expect(main.locator('#deskmail-search')).toHaveValue('jk')
    expect(app.windows().length).toBe(1)

    // Clear + blur, then '?' shows the cheat-sheet overlay.
    await main.locator('#deskmail-search').fill('')
    await main.locator('#deskmail-search').blur()
    await main.keyboard.press('?')
    await expect(main.getByTestId('shortcut-help')).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
