import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

test('portable mode reads/writes the given data dir', async () => {
  const portableDir = mkdtempSync(join(tmpdir(), 'deskmail-portable-'))
  // Launch with --portable <dir>; do NOT set DESKMAIL_USER_DATA so we exercise
  // the portable path, plus seed demo data so the DB is populated.
  const env = { ...process.env, DESKMAIL_SEED_DEMO: '1' }
  delete (env as Record<string, string | undefined>).DESKMAIL_USER_DATA
  const app = await electron.launch({ args: [MAIN, '--portable', portableDir], env })
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(900)
    // The database was created inside the portable folder.
    expect(existsSync(join(portableDir, 'deskmail.db'))).toBe(true)
    // And Settings reports portable mode + that folder.
    const info = await win.evaluate(() => window.deskmail.storage.info())
    expect(info.portable).toBe(true)
    expect(info.dataDir).toBe(portableDir)
  } finally {
    await app.close()
    safeRm(portableDir)
  }
})

test('back up now + restore round-trips the local store', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-bak-'))
  const backupParent = mkdtempSync(join(tmpdir(), 'deskmail-bakdst-'))
  const app: ElectronApplication = await electron.launch({
    args: [MAIN],
    env: { ...process.env, DESKMAIL_USER_DATA: userData, DESKMAIL_SEED_DEMO: '1' }
  })
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(900)
    await expect(win.locator('[data-testid^="msg-row-"]').first()).toBeVisible()

    // Back up to a chosen folder.
    const { path } = await win.evaluate((dest) => window.deskmail.storage.backup(dest), backupParent)
    expect(path).toContain('deskmail-backup-')
    expect(existsSync(join(path as string, 'deskmail.db'))).toBe(true)

    // Snooze a message to change state, then restore the backup to undo it.
    const before = await win.evaluate(() => window.deskmail.mail.listMessages(1).then((m) => m.length))
    await win.getByTestId('msg-row-2').click()
    await win.getByRole('button', { name: 'Snooze' }).click()
    await win.getByText('Tomorrow', { exact: true }).click()
    await expect(win.locator('[data-testid^="msg-row-"]')).toHaveCount(before - 1)

    await win.evaluate((p) => window.deskmail.storage.restore(p), path as string)
    await win.waitForTimeout(500)
    // After restore the snooze is gone → the message count is back.
    const after = await win.evaluate(() => window.deskmail.mail.listMessages(1).then((m) => m.length))
    expect(after).toBe(before)
  } finally {
    await app.close()
    safeRm(userData)
    safeRm(backupParent)
  }
})
