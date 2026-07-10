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
