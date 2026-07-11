// Builds the two PDF guides with annotated screenshots.
//   1. captures screenshots by driving the app and drawing highlight boxes on
//      the real buttons/menus, then
//   2. assembles them into PDFs with pdfkit.
// Run:  node scripts/build-guides.mjs   (after `npm run build`)
import { _electron as electron } from 'playwright'
import PDFDocument from 'pdfkit'
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG = join(ROOT, 'guides', 'img')
mkdirSync(IMG, { recursive: true })

const ACCENT = '#1e7a38'
const INK = '#1f2933'
const MUTE = '#5b6672'

// ---- annotation helpers -------------------------------------------------------
async function boxesFor(locators) {
  const out = []
  for (let i = 0; i < locators.length; i++) {
    const bb = await locators[i].boundingBox().catch(() => null)
    if (bb) out.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height, n: i + 1 })
  }
  return out
}
async function draw(win, boxes) {
  await win.evaluate((boxes) => {
    document.getElementById('__anno')?.remove()
    const layer = document.createElement('div')
    layer.id = '__anno'
    Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' })
    for (const b of boxes) {
      const box = document.createElement('div')
      Object.assign(box.style, {
        position: 'absolute', left: b.x - 5 + 'px', top: b.y - 5 + 'px', width: b.w + 10 + 'px', height: b.h + 10 + 'px',
        border: '3px solid #ff3b30', borderRadius: '9px', boxShadow: '0 0 0 4px rgba(255,59,48,.18)'
      })
      layer.appendChild(box)
      const badge = document.createElement('div')
      badge.textContent = String(b.n)
      const bx = Math.max(2, b.x - 16)
      const by = Math.max(2, b.y - 16)
      Object.assign(badge.style, {
        position: 'absolute', left: bx + 'px', top: by + 'px', width: '26px', height: '26px', borderRadius: '50%',
        background: '#ff3b30', color: '#fff', font: '700 14px system-ui,sans-serif', display: 'flex',
        alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.35)'
      })
      layer.appendChild(badge)
    }
    document.body.appendChild(layer)
  }, boxes)
}
async function clearAnno(win) {
  await win.evaluate(() => document.getElementById('__anno')?.remove())
}

const shots = {} // name -> { file, legend: [str] }
async function capture(win, name, targets) {
  const boxes = []
  for (let i = 0; i < targets.length; i++) {
    const bb = await targets[i].loc.boundingBox().catch(() => null)
    if (bb) boxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height, n: i + 1 })
    else console.error(`  ⚠ ${name}: no box for #${i + 1} "${targets[i].label}"`)
  }
  await draw(win, boxes)
  const file = join(IMG, `${name}.png`)
  await win.screenshot({ path: file })
  await clearAnno(win)
  shots[name] = { file, legend: targets.map((t) => t.label) }
}

// ---- capture ------------------------------------------------------------------
async function captureAll() {
  const userData = mkdtempSync(join(tmpdir(), 'deskmail-guide-'))
  const app = await electron.launch({
    args: [join(ROOT, 'out', 'main', 'index.js')],
    env: { ...process.env, DESKMAIL_USER_DATA: userData, DESKMAIL_SEED_DEMO: '1' }
  })
  const win = await app.firstWindow()
  await win.waitForTimeout(1200)
  let connectorConfig = ''

  // Main overview
  await win.getByTestId('msg-row-3').click()
  await win.waitForTimeout(300)
  await capture(win, 'main', [
    { loc: win.getByText('File', { exact: true }), label: 'Menus — File, View, Help' },
    { loc: win.getByRole('button', { name: 'Mail', exact: true }), label: 'Today / Mail / Calendar' },
    { loc: win.getByRole('button', { name: 'Layout preset' }), label: 'Layout preset (window arrangement)' },
    { loc: win.getByPlaceholder('Search mail…'), label: 'Search your mail' },
    { loc: win.getByRole('button', { name: 'Compose' }), label: 'Compose a new message' },
    { loc: win.getByRole('button', { name: 'Claude', exact: true }), label: 'Claude assistant panel' },
    { loc: win.getByRole('button', { name: 'Toggle theme' }), label: 'Light / Dark toggle' }
  ])

  // Reading a message
  await capture(win, 'reading', [
    { loc: win.getByRole('button', { name: 'Reply', exact: true }), label: 'Reply / Reply all / Forward' },
    { loc: win.getByRole('button', { name: 'Archive' }).last(), label: 'Archive · Delete · Star · Mark unread' },
    { loc: win.getByRole('button', { name: 'Snooze' }), label: 'Snooze (hide until later)' },
    { loc: win.getByRole('button', { name: 'NotebookLM' }), label: 'Export this email for NotebookLM' },
    { loc: win.getByRole('button', { name: 'Ask Claude' }), label: 'Ask Claude about this email' }
  ])

  // Compose (captured before Settings so no modal blocks the buttons)
  await win.getByRole('button', { name: 'Compose' }).click()
  await win.waitForTimeout(300)
  await win.getByLabel('To', { exact: true }).fill('priya@makerspace.uk')
  await win.getByRole('textbox', { name: 'Subject', exact: true }).fill('Re: Radiator clip licence')
  await win.locator('.ProseMirror').click()
  await win.keyboard.type('Morning Priya — happy to license this for resale of printed units.')
  await win.waitForTimeout(200)
  await capture(win, 'compose', [
    { loc: win.getByLabel('To', { exact: true }), label: 'To (with Cc / Bcc)' },
    { loc: win.getByRole('button', { name: 'Templates' }), label: 'Insert a saved reply template' },
    { loc: win.getByRole('button', { name: 'Send', exact: true }), label: 'Send now (with an undo window)' },
    { loc: win.getByRole('button', { name: 'Send later' }), label: 'Schedule for later' },
    { loc: win.getByRole('button', { name: 'Save draft' }), label: 'Save as a draft' }
  ])
  await win.getByTitle('Close').last().click() // compose modal's close (not the window control)
  await win.waitForTimeout(300)

  // Open the File menu → Settings
  await win.getByText('File', { exact: true }).click()
  await win.waitForTimeout(200)
  await capture(win, 'open-settings', [{ loc: win.getByText('Settings…'), label: 'Open Settings' }])
  await win.getByText('Settings…').click()
  await win.waitForTimeout(300)

  // Settings → Accounts
  await capture(win, 'settings-accounts', [
    { loc: win.getByRole('button', { name: 'Accounts' }), label: 'Accounts section' },
    { loc: win.getByRole('button', { name: 'Add account' }), label: 'Add a new mailbox' }
  ])

  // Account wizard (fill example values), top half
  await win.getByRole('button', { name: 'Add account' }).click()
  await win.getByLabel('Display name').fill('Alex Doe')
  await win.getByLabel('Email address').fill('you@example.com')
  await win.getByPlaceholder('imap.example.com').fill('imap.fastmail.com')
  await win.getByPlaceholder('smtp.example.com').fill('smtp.fastmail.com')
  await win.getByLabel('Username').fill('you@example.com')
  await win.getByLabel('Password').fill('••••••••••••')
  // Scroll the modal back to the top so the name/email/incoming fields are shown.
  await win.getByLabel('Display name').scrollIntoViewIfNeeded()
  await win.waitForTimeout(300)
  await capture(win, 'wizard-top', [
    { loc: win.getByLabel('Display name'), label: 'Your display name' },
    { loc: win.getByLabel('Email address'), label: 'Your email address' },
    { loc: win.getByText('IMAP', { exact: true }), label: 'Incoming type — IMAP (recommended) or POP3' },
    { loc: win.getByPlaceholder('imap.example.com'), label: 'Incoming server host + port + security' }
  ])

  // scroll the wizard to the bottom
  await win.getByLabel('Password').scrollIntoViewIfNeeded()
  await win.waitForTimeout(200)
  await capture(win, 'wizard-bottom', [
    { loc: win.getByPlaceholder('smtp.example.com'), label: 'Outgoing (SMTP) server' },
    { loc: win.getByRole('button', { name: 'Test outgoing' }), label: 'Test the outgoing connection' },
    { loc: win.getByLabel('Username'), label: 'Username (usually your email)' },
    { loc: win.getByLabel('Password'), label: 'Password (or an app password)' },
    { loc: win.getByRole('button', { name: 'Save', exact: true }), label: 'Save the account' }
  ])
  await win.getByRole('button', { name: 'Cancel' }).click()

  // Security / junk
  await win.getByRole('button', { name: 'Security' }).click()
  await win.waitForTimeout(200)
  await capture(win, 'security', [
    { loc: win.getByText('Automatically filter junk'), label: 'Turn the junk filter on/off' }
  ])

  // Local storage / backup
  await win.getByRole('button', { name: 'Local storage' }).click()
  await win.waitForTimeout(200)
  await capture(win, 'backup', [
    { loc: win.getByRole('button', { name: 'Back up now' }), label: 'Back up the whole mailbox to a folder' },
    { loc: win.getByRole('button', { name: 'Restore from backup' }), label: 'Restore from a backup' }
  ])

  // Claude connector — grab the config JSON too
  await win.getByRole('button', { name: 'Claude connector' }).click()
  await win.waitForTimeout(300)
  connectorConfig = await win.evaluate(() => window.deskmail.mcp.info().then((i) => i.configJson))
  await capture(win, 'connector', [
    { loc: win.getByRole('button', { name: 'Copy' }), label: 'Copy the connector config' },
    { loc: win.getByText('Available tools'), label: 'What Claude can do (read/draft/organise only)' },
    { loc: win.getByText('Connect Claude Desktop'), label: 'Ready-to-paste config for Claude Desktop' }
  ])

  await app.close()
  rmSync(userData, { recursive: true, force: true })
  return connectorConfig
}

// ---- PDF assembly -------------------------------------------------------------
function newDoc(path) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'DeskMail AI', Author: 'DeskMail AI' } })
  doc.pipe(createWriteStream(path))
  return doc
}
function cover(doc, title, subtitle) {
  doc.image(join(ROOT, 'build', 'icon.png'), doc.page.width / 2 - 55, 150, { width: 110 })
  doc.moveDown()
  doc.y = 290
  doc.fontSize(30).fillColor(INK).font('Helvetica-Bold').text('DeskMail AI', { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(16).fillColor(ACCENT).font('Helvetica-Bold').text(title, { align: 'center' })
  doc.moveDown(0.6)
  doc.fontSize(11).fillColor(MUTE).font('Helvetica').text(subtitle, { align: 'center' })
  doc.fontSize(9).fillColor(MUTE).text('DeskMail AI', 48, doc.page.height - 70, { align: 'center', width: doc.page.width - 96 })
}
function h(doc, text) {
  if (doc.y > doc.page.height - 220) doc.addPage()
  doc.moveDown(0.6)
  doc.fontSize(15).fillColor(ACCENT).font('Helvetica-Bold').text(text)
  doc.moveDown(0.2)
}
function p(doc, text) {
  doc.fontSize(10.5).fillColor(INK).font('Helvetica').text(text, { lineGap: 2 })
  doc.moveDown(0.2)
}
function shot(doc, name) {
  const s = shots[name]
  if (!s) return
  const w = doc.page.width - 96
  if (doc.y > doc.page.height - 260) doc.addPage()
  doc.image(s.file, { fit: [w, 300], align: 'center' })
  doc.moveDown(0.4)
  // legend
  s.legend.forEach((label, i) => {
    doc.fontSize(9.5).fillColor('#ff3b30').font('Helvetica-Bold').text(`  ${i + 1}  `, { continued: true })
    doc.fillColor(INK).font('Helvetica').text(label)
  })
  doc.moveDown(0.4)
}

function buildUserGuide(path) {
  const doc = newDoc(path)
  cover(doc, 'User Guide', 'Getting set up and finding your way around your local email client.')

  doc.addPage()
  h(doc, 'What DeskMail AI is')
  p(doc, 'DeskMail AI is your own desktop email client. It connects to your email account (IMAP/SMTP), keeps a copy of your mail locally so you can read it offline, and lets Claude help you search, draft and organise — all on this PC. Nothing is stored in the cloud by DeskMail; your mail and settings live on your machine.')

  h(doc, '1 · The main window')
  p(doc, 'Everything is reachable from the bars along the top:')
  shot(doc, 'main')

  h(doc, '2 · Add your email account')
  p(doc, 'Open the File menu and choose Settings.')
  shot(doc, 'open-settings')
  p(doc, 'In Settings, the Accounts section is selected. Click “Add account”.')
  shot(doc, 'settings-accounts')
  p(doc, 'Fill in your account details. Your provider publishes these as “IMAP and SMTP settings” — search e.g. “Fastmail IMAP settings” or “Gmail IMAP settings”. Typical incoming (IMAP) is port 993 / SSL; outgoing (SMTP) is 465 / SSL or 587 / STARTTLS.')
  shot(doc, 'wizard-top')
  p(doc, 'Scroll down for the outgoing server and your sign-in. Test both connections, then Save.')
  shot(doc, 'wizard-bottom')
  p(doc, 'Tip: for Gmail, Outlook.com and iCloud you usually need an “app password” (generated in the provider’s security settings) rather than your normal password, because of two-factor authentication. Your password is encrypted by Windows and never stored in plain text.')

  h(doc, '3 · Reading & organising mail')
  p(doc, 'Click a message to read it; double-click to open it in its own window. Remote images are blocked by default to stop senders tracking you — click “Load images” if you trust the sender.')
  shot(doc, 'reading')
  p(doc, 'Archive, delete (moves to Bin — reversible), star, mark unread, or snooze a message to hide it until later. Actions apply straight away and are pushed to your mail server.')

  h(doc, '4 · Writing email')
  p(doc, 'Click Compose. Add recipients, a subject and your message. You can insert a saved template, attach files, and either send now (with a short undo window) or schedule it for later. Your signature is added automatically.')
  shot(doc, 'compose')

  h(doc, '5 · Junk filtering')
  p(doc, 'Obvious spam is moved to Junk automatically. It’s deliberately cautious; if something legitimate lands there, open it and click “Not junk”. You can turn the filter on or off in Settings → Security.')
  shot(doc, 'security')

  h(doc, '6 · Backing up & moving to a new PC')
  p(doc, 'In Settings → Local storage, “Back up now” copies your whole mailbox — the database, attachments and settings — into a single dated folder you can put on a USB drive. On a new machine, install DeskMail, then use “Restore from backup”. You’ll re-enter each account’s password once (Windows ties saved passwords to a specific PC).')
  shot(doc, 'backup')
  p(doc, 'Also keep a copy of the installer (DeskMail AI-0.1.0-setup.exe) on the same USB drive so you can reinstall the app itself.')

  doc.end()
}

function buildConnectorGuide(path, config) {
  const doc = newDoc(path)
  cover(doc, 'Connecting Claude Desktop', 'Let Claude safely search, read, draft and organise your mail.')

  doc.addPage()
  h(doc, 'What this does (and what it can’t)')
  p(doc, 'DeskMail includes a small local “MCP server” that lets the Claude Desktop app work with your mail. Claude can search, read, summarise, draft, and organise (move / flag / mark read / delete-to-Bin). It can NEVER send email, permanently delete anything, see your passwords, or change your account settings — and any draft it writes waits in your Drafts for you to review and send.')
  p(doc, 'Important: this connects the Claude DESKTOP app (installed on this PC), not the Claude website. A local connector like this can’t be added on claude.ai in a browser — that would need a hosted server. So install Claude Desktop first if you haven’t.')

  h(doc, '1 · Copy the connector config from DeskMail')
  p(doc, 'Open DeskMail → File → Settings → Claude connector. Click “Copy” — this copies a small block of settings unique to your install (with the correct paths).')
  shot(doc, 'connector')

  h(doc, '2 · Paste it into Claude Desktop')
  p(doc, 'In Claude Desktop, open Settings → Developer → “Edit Config”. That opens a file called claude_desktop_config.json in a text editor. Paste in what you copied. If the file already has an "mcpServers" section, merge the "deskmail-ai" entry into it rather than duplicating the key. Save the file.')
  p(doc, 'For reference, the config looks like this (use the one you copied from your own install — the paths will match your machine):')
  doc.moveDown(0.2)
  doc.rect(48, doc.y, doc.page.width - 96, 0).stroke('#e4e4e4')
  doc.fontSize(8.5).fillColor('#1f2933').font('Courier').text(config || '{ "mcpServers": { "deskmail-ai": { ... } } }', { lineGap: 1 })
  doc.moveDown(0.4)

  h(doc, '3 · Restart Claude Desktop')
  p(doc, 'Fully quit and reopen Claude Desktop so it picks up the new connector. You should see the DeskMail tools become available (a tools/plug icon in the Claude Desktop chat).')

  h(doc, '4 · Try it')
  p(doc, 'Ask Claude things like:')
  p(doc, '   • “Search my unread mail and summarise what needs a reply.”')
  p(doc, '   • “Draft a reply to Priya about the licence.” (it appears in DeskMail’s Drafts)')
  p(doc, '   • “Move the GitHub notifications to Archive and flag Maya’s email.”')
  p(doc, '   • “Export Maya’s email and its attachments for NotebookLM.”')

  h(doc, 'Troubleshooting')
  p(doc, '• Tools don’t appear: make sure DeskMail has been run at least once (so the database exists), the JSON is valid (no trailing commas), and you fully restarted Claude Desktop.')
  p(doc, '• “Server failed”: re-copy the config from DeskMail — the file paths must match where DeskMail is installed on this PC.')
  p(doc, '• Claude’s changes (moves/flags) show in DeskMail within about 20 seconds, once it pushes them to your mail server.')

  doc.end()
}

// ---- run ----------------------------------------------------------------------
const config = await captureAll()
mkdirSync(join(ROOT, 'guides'), { recursive: true })
buildUserGuide(join(ROOT, 'guides', 'DeskMail-AI-User-Guide.pdf'))
buildConnectorGuide(join(ROOT, 'guides', 'DeskMail-AI-Claude-Connector-Guide.pdf'), config)
// give the PDF streams a moment to flush
await new Promise((r) => setTimeout(r, 800))
console.log('Guides written to guides/')
