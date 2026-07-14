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

test('a Claude-created draft is visible in the Drafts view and opens in Compose', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-drafts-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)

    // Simulate what the MCP create_draft tool does: a Claude-authored draft.
    await win.evaluate(() =>
      window.deskmail.compose.saveDraft({
        accountId: 1,
        to: ['priya@makerspace.uk'],
        cc: [],
        bcc: [],
        subject: 'Re: Radiator clip — commercial licence',
        bodyHtml: '<p>Happy to license this for resale of printed units.</p>'
      })
    )

    // Open the Drafts view from the sidebar (inline, not a pop-up).
    await win.getByRole('button', { name: 'Drafts' }).click()
    const view = win.getByTestId('drafts-view')
    await expect(view.getByText('Re: Radiator clip — commercial licence')).toBeVisible()

    // Select the draft in the list → its preview opens with the actions.
    await view.getByText('Re: Radiator clip — commercial licence').click()

    // Edit it → Compose opens prefilled in its own window.
    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      view.getByRole('button', { name: 'Edit' }).click()
    ])
    await cmp.waitForLoadState()
    await expect(cmp.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Re: Radiator clip — commercial licence')
    await expect(cmp.locator('.ProseMirror')).toContainText('license this for resale')
  } finally {
    await app.close()
    safeRm(userData)
  }
})
