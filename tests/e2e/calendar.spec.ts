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

test('creating an event shows it in the month grid', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cal-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(600)

    await win.getByRole('button', { name: 'Calendar' }).click()
    await win.getByRole('button', { name: 'New event' }).first().click()

    await win.getByLabel('Title').fill('Filament reorder')
    // Pick a provider that needs no link.
    await win.getByRole('button', { name: 'In person' }).click()
    await win.getByRole('button', { name: 'Save event' }).click()

    // It appears somewhere in the month grid.
    await expect(win.getByText('Filament reorder').first()).toBeVisible()

    const events = await win.evaluate(() => window.deskmail.calendar.listEvents())
    expect(events.some((e) => e.title === 'Filament reorder' && e.provider === 'inperson')).toBe(true)
  } finally {
    await app.close()
    safeRm(userData)
  }
})

test('accepting an email invite adds the event to the calendar', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-cal-'))
  const app = await launch(userData)
  try {
    const win = await app.firstWindow()
    await win.waitForTimeout(700)

    // The seeded invite email (row 7) shows an invite card.
    await win.getByTestId('msg-row-7').click()
    await expect(win.getByTestId('invite-card')).toBeVisible()

    await win.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(win.getByText('Added to your calendar')).toBeVisible()

    // The event now exists in the calendar.
    const events = await win.evaluate(() => window.deskmail.calendar.listEvents())
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Q3 launch sync')
    expect(events[0].date).toBe('2026-07-09')
    expect(events[0].provider).toBe('teams')

    // And it renders in the month view.
    await win.getByRole('button', { name: 'Calendar' }).click()
    await expect(win.getByText('Q3 launch sync').first()).toBeVisible()
  } finally {
    await app.close()
    safeRm(userData)
  }
})
