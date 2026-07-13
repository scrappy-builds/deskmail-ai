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

test('templates: insert a canned reply into compose', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-f8-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(600)
    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      win.getByRole('button', { name: 'Compose' }).click()
    ])
    await cmp.waitForLoadState()
    await cmp.getByRole('button', { name: 'Templates' }).click()
    await cmp.getByRole('button', { name: 'Acknowledge receipt' }).click()
    await expect(cmp.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Re: your email')
    await expect(cmp.locator('.ProseMirror')).toContainText('received it')
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('snooze: hides a message from the inbox list', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-f8-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)
    const rows = win.locator('[data-testid^="msg-row-"]')
    await expect(rows).toHaveCount(7)

    await win.getByTestId('msg-row-2').click()
    await win.getByRole('button', { name: 'Snooze' }).click()
    await win.getByText('Tomorrow', { exact: true }).click()

    await expect(rows).toHaveCount(6)
    await expect(win.getByTestId('msg-row-2')).toHaveCount(0)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('signatures: add and save a per-account signature', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-f8-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(600)
    await win.getByText('File', { exact: true }).click()
    await win.getByText('Settings…').click()
    await win.getByRole('button', { name: 'Signatures' }).click()
    await win.getByRole('button', { name: 'Add signature' }).click()
    await win.getByPlaceholder('Signature name (e.g. Work, Personal)').fill('Work')
    await win.getByPlaceholder('Type your signature…').fill('Cheers,\nAlex — Example Co')
    await win.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(win.getByText('Signature saved')).toBeVisible()

    // It's persisted for compose.
    const sigs = await win.evaluate(() => window.deskmail.compose.listSignatures(1))
    expect(sigs.some((s) => s.body.includes('Example Co'))).toBe(true)
  } finally {
    await app.close()
    safeRm(userData)
  }
})
