import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

test('Send to NotebookLM exports the email to a folder for the skill to add', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-nlm-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(800)

    await win.getByTestId('msg-row-1').click()
    const result = await win.evaluate(() => window.deskmail.notebooklm.export(1, false))
    expect(result.folder).toContain('notebooklm-export')
    expect(result.files.map((f) => f.name)).toContain('email.txt')

    const emailFile = result.files.find((f) => f.name === 'email.txt')!.path
    expect(existsSync(emailFile)).toBe(true)
    expect(readFileSync(emailFile, 'utf-8')).toContain('Q3 launch timeline')

    // The reading-pane button works too.
    await win.getByRole('button', { name: 'NotebookLM' }).click()
    await expect(win.getByText(/for NotebookLM/i)).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
