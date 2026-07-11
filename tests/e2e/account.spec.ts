import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')
const PASSWORD = 'Sup3rSecretPw!_deskmail'

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
async function openAccountsWizard(win: Page): Promise<void> {
  await win.getByText('File', { exact: true }).click()
  await win.getByText('Settings…').click()
  await win.getByRole('button', { name: 'Add account' }).click()
}

test('wizard saves an account; password is encrypted at rest and persists', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-acc-'))
  let app = await launch(userData)
  try {
    let win = await app.firstWindow()
    await win.waitForTimeout(300)
    await openAccountsWizard(win)

    await win.getByLabel('Display name').fill('Alex Doe')
    await win.getByLabel('Email address').fill('alex@example.com')
    await win.getByPlaceholder('imap.example.com').fill('imap.example.com')
    await win.getByPlaceholder('smtp.example.com').fill('smtp.example.com')
    await win.getByLabel('Username').fill('alex@example.com')
    await win.getByLabel('Password').fill(PASSWORD)

    await win.getByRole('button', { name: 'Save' }).click()

    // The account now shows in the list.
    await expect(win.getByText('alex@example.com').first()).toBeVisible()

    // Encrypted at rest: the plaintext password must not appear in the DB file.
    const dbBytes = readFileSync(join(userData, 'deskmail.db'))
    expect(dbBytes.includes(Buffer.from(PASSWORD))).toBe(false)

    await app.close()

    // Persists across relaunch.
    app = await launch(userData)
    win = await app.firstWindow()
    await win.waitForTimeout(300)
    await win.getByText('File', { exact: true }).click()
    await win.getByText('Settings…').click()
    await expect(win.getByText('alex@example.com').first()).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('testing an unreachable server shows "Server settings incorrect"', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-acc-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(300)
    await openAccountsWizard(win)

    // Point incoming at a closed local port so the connection is refused quickly.
    await win.getByPlaceholder('imap.example.com').fill('127.0.0.1')
    await win.getByLabel('Port').first().fill('9')
    await win.getByLabel('Username').fill('alex@example.com')
    await win.getByLabel('Password').fill(PASSWORD)

    await win.getByRole('button', { name: 'Test incoming' }).click()
    await expect(win.getByText('Server settings incorrect')).toBeVisible({ timeout: 20000 })
  } finally {
    await app.close()
    safeRm(userData)
  }
})
