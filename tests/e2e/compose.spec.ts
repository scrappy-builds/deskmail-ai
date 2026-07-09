import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

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
const rows = (win: Page) => win.locator('[data-testid^="msg-row-"]')

test('search filters the message list and clears back', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cmp-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)
    await expect(rows(win)).toHaveCount(7)

    await win.getByPlaceholder('Search mail…').fill('invoice')
    await expect(rows(win)).toHaveCount(1)
    await expect(win.getByText('Search: invoice')).toBeVisible()

    await win.getByPlaceholder('Search mail…').fill('')
    await expect(rows(win)).toHaveCount(7)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('compose saves a draft that persists across relaunch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cmp-'))
  let app = await launch(userData)
  try {
    let win = await app.firstWindow()
    await win.waitForTimeout(700)

    // Compose opens in its own window now.
    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      win.getByRole('button', { name: 'Compose' }).click()
    ])
    await cmp.waitForLoadState()
    await cmp.getByLabel('To', { exact: true }).fill('priya@makerspace.uk')
    await cmp.getByRole('textbox', { name: 'Subject', exact: true }).fill('Licence follow-up')
    await cmp.locator('.ProseMirror').click()
    await cmp.keyboard.type('Following up on the clause we discussed.')
    await cmp.getByRole('button', { name: 'Save draft' }).click()
    await expect(cmp.getByText('Draft saved')).toBeVisible()

    await app.close()

    // Relaunch and confirm the draft is in the DB.
    app = await launch(userData)
    win = await app.firstWindow()
    await win.waitForTimeout(500)
    const drafts = await win.evaluate(() => window.deskmail.compose.listDrafts())
    expect(drafts).toHaveLength(1)
    expect(drafts[0].subject).toBe('Licence follow-up')
    expect(drafts[0].to).toContain('priya@makerspace.uk')
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('sending is a manual action queued behind an undo window', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cmp-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)

    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      win.getByRole('button', { name: 'Compose' }).click()
    ])
    await cmp.waitForLoadState()
    await cmp.getByLabel('To', { exact: true }).fill('someone@example.com')
    await cmp.getByRole('textbox', { name: 'Subject', exact: true }).fill('Hello')

    // Send only fires on the click, and even then it's queued with an Undo window —
    // nothing leaves automatically. Undo cancels it before it's delivered.
    await cmp.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(cmp.getByText('Sending your message…')).toBeVisible()
    const scheduledBefore = await win.evaluate(() => window.deskmail.compose.listScheduled())
    expect(scheduledBefore.length).toBe(1)

    await cmp.getByRole('button', { name: 'Undo' }).click()
    const scheduledAfter = await win.evaluate(() => window.deskmail.compose.listScheduled())
    expect(scheduledAfter.length).toBe(0)
  } finally {
    await app.close()
    safeRm(userData)
  }
})
