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

test('address book: pick a contact straight into the To field', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cmp-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)

    // A contact to pick (demo seed has none).
    await win.evaluate(() => window.deskmail.contacts.create({ name: 'Priya Patel', email: 'priya@example.com', org: null, notes: null, groups: [] }))

    // Compose loads contacts on mount, so open it after the contact exists.
    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      win.getByRole('button', { name: 'Compose' }).click()
    ])
    await cmp.waitForLoadState()

    await cmp.getByRole('button', { name: 'Add from contacts' }).click()
    const picker = cmp.getByTestId('contact-picker')
    await picker.getByText('Priya Patel').click() // ticks the contact
    await picker.getByRole('button', { name: 'To', exact: true }).click()
    await picker.getByRole('button', { name: 'Done' }).click()

    // The address landed as a chip in To — no typing.
    await expect(cmp.getByText('priya@example.com')).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})

// Regression for the reply that "vanished as ···": the typed reply must land ABOVE
// the separator/quote, not inside the <blockquote> (which the Sent view collapses).
// Driven through the real app + real TipTap editor — the layer unit tests can't see.
test('reply: typed text lands above the separator and quote, with attribution', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cmp-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)

    // Open a demo message, then Reply (opens its own compose window).
    await win.getByTestId('msg-row-1').click()
    const [cmp] = await Promise.all([
      app.waitForEvent('window'),
      win.getByRole('button', { name: 'Reply', exact: true }).click()
    ])
    await cmp.waitForLoadState()

    // The reply scaffold is there: a solid separator and a "wrote:" attribution.
    const editorHtml = await cmp.locator('.ProseMirror').innerHTML()
    expect(editorHtml).toContain('<hr')
    expect(editorHtml).toContain('wrote:')

    // Type at the very start of the document (as a user typing their reply).
    await cmp.locator('.ProseMirror').click()
    await cmp.keyboard.press('Control+Home')
    await cmp.keyboard.type('MYUNIQUEREPLYBODY')

    await cmp.getByRole('button', { name: 'Save draft' }).click()
    await expect(cmp.getByText('Draft saved')).toBeVisible()

    // The saved draft must contain the typed reply (regression: it was dropped
    // because the send/save payload read a stale, memoised editor body), and it must
    // sit before the <hr> and the quote — i.e. above the line, not inside the quote.
    const body = await win.evaluate(async () => (await window.deskmail.compose.listDrafts())[0].bodyHtml ?? '')
    expect(body).toContain('MYUNIQUEREPLYBODY')
    expect(body.indexOf('MYUNIQUEREPLYBODY')).toBeLessThan(body.indexOf('<hr'))
    expect(body.indexOf('MYUNIQUEREPLYBODY')).toBeLessThan(body.indexOf('<blockquote'))
  } finally {
    await app.close()
    safeRm(userData)
  }
})
