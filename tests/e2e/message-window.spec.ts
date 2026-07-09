import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [MAIN], env: { ...process.env, DESKMAIL_USER_DATA: userData } })
}
function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}
async function openById(app: ElectronApplication, main: Page, id: number): Promise<Page> {
  await main.getByTestId(`msg-row-${id}`).dblclick()
  const win = await app.waitForEvent('window')
  await win.waitForLoadState('domcontentloaded')
  await expect(win.getByTestId('message-window')).toHaveAttribute('data-message-id', String(id))
  return win
}

test('double-click opens an isolated message window by id', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mw-'))
  const app = await launch(userData)
  try {
    const main = await app.firstWindow()
    await main.waitForTimeout(300)

    const win = await openById(app, main, 2)

    // Content matches the message.
    await expect(win.getByRole('heading', { name: 'Your invoice for June is ready' })).toBeVisible()

    // Isolation: the message window renderer has no Node access.
    const sec = await win.evaluate(() => ({
      req: typeof (window as unknown as { require?: unknown }).require,
      proc: typeof (window as unknown as { process?: unknown }).process,
      bridge: typeof window.deskmail
    }))
    expect(sec.req).toBe('undefined')
    expect(sec.proc).toBe('undefined')
    expect(sec.bridge).toBe('object')
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('multiple windows coexist and close independently', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mw-'))
  const app = await launch(userData)
  try {
    const main = await app.firstWindow()
    await main.waitForTimeout(300)

    const winA = await openById(app, main, 1)
    const winB = await openById(app, main, 4)
    expect(app.windows().length).toBe(3) // main + 2 message windows

    // Close one; the other window and the main window survive.
    await winA.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect.poll(() => app.windows().length).toBe(2)
    await expect(winB.getByTestId('message-window')).toHaveAttribute('data-message-id', '4')
    await expect(main.getByRole('button', { name: 'Layout preset' })).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('re-opening the same message focuses the existing window (no duplicate)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-mw-'))
  const app = await launch(userData)
  try {
    const main = await app.firstWindow()
    await main.waitForTimeout(300)

    await openById(app, main, 5)
    expect(app.windows().length).toBe(2)

    // Double-click the same row again — should not spawn a second window.
    await main.getByTestId('msg-row-5').dblclick()
    await main.waitForTimeout(500)
    expect(app.windows().length).toBe(2)
  } finally {
    await app.close()
    safeRm(userData)
  }
})
