import type { DB } from '../../db/database'
import { upsertFolder, refreshFolderCounts } from '../../db/folders'
import { ensureDefaultSignature } from '../../db/signatures'
import { ingestRaw } from './ingest'
import { applyJunkIfSpam } from './junk'

// Env-gated demo data so the app (and the E2E suite) can show a populated
// mailbox without a live IMAP account. Never runs in normal use.
function rawEmail(opts: { from: string; to: string; subject: string; date: string; html: string }): string {
  return [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Date: ${opts.date}`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@deskmail.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    opts.html,
    ''
  ].join('\r\n')
}

// A calendar invite email: multipart with an inline text/calendar (ICS) part.
const INVITE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'SUMMARY:Q3 launch sync',
  'DTSTART:20260709T140000Z',
  'DTEND:20260709T143000Z',
  'LOCATION:Microsoft Teams Meeting',
  'URL:https://teams.microsoft.com/l/meetup-join/demo-q3-sync',
  'ORGANIZER;CN=Maya Chen:mailto:maya@northwind.studio',
  'ATTENDEE;CN=Jamie Bell:mailto:jamie@example.com',
  'ATTENDEE;CN=Alex Reed:mailto:alex@northwind.studio',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

function inviteEmail(): string {
  return [
    'From: "Maya Chen" <maya@northwind.studio>',
    'To: jamie@example.com',
    'Subject: Invitation: Q3 launch sync (Thu 9 Jul, 14:00)',
    'Date: Tue, 07 Jul 2026 09:20:00 +0100',
    `Message-ID: <invite-${Math.random().toString(36).slice(2)}@northwind.studio>`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="MIX"',
    '',
    '--MIX',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Sending a calendar invite for a short sync on the Q3 launch timeline so we can confirm sign-off before the vendor call.</p>',
    '--MIX',
    'Content-Type: text/calendar; method=REQUEST; name="invite.ics"',
    'Content-Disposition: attachment; filename="invite.ics"',
    '',
    INVITE_ICS,
    '--MIX--',
    ''
  ].join('\r\n')
}

const EMAILS = [
  {
    from: '"Maya Chen" <maya@northwind.studio>',
    to: 'jamie@example.com',
    subject: 'Q3 launch timeline — need your sign-off',
    date: 'Tue, 07 Jul 2026 09:41:00 +0100',
    read: false,
    starred: true,
    // Contains a remote tracking pixel and a script — both must be neutralised on display.
    html: `<p>Sharing the updated launch plan — the dates shifted after the infra review.</p>
           <p>Can you confirm the print run window still works your end?</p>
           <p>Maya</p>
           <img src="https://tracker.northwind.studio/open.gif?id=42" width="1" height="1">
           <script>window.__pwned = true</script>`
  },
  {
    from: '"Stripe" <receipts@stripe.com>',
    to: 'jamie@example.com',
    subject: 'Your invoice for June is ready',
    date: 'Tue, 07 Jul 2026 08:12:00 +0100',
    read: false,
    starred: false,
    html: '<p>Invoice #INV-2041 for £1,290.00 has been issued.</p><p>View or download the PDF from your dashboard.</p>'
  },
  {
    from: '"Priya Nair" <priya@makerspace.uk>',
    to: 'jamie@example.com',
    subject: 'Re: Radiator clip — commercial licence',
    date: 'Tue, 07 Jul 2026 07:48:00 +0100',
    read: true,
    starred: false,
    html: '<p>Thanks for the quick turnaround. One question about the non-commercial clause before I sign — does it cover resale of printed units, or only the STL itself?</p>'
  },
  {
    from: '"GitHub" <noreply@github.com>',
    to: 'jamie@example.com',
    subject: '[northwind/desk-mail] 3 new pull requests',
    date: 'Tue, 07 Jul 2026 07:03:00 +0100',
    read: false,
    starred: false,
    html: '<p>PR #418 Fix IMAP reconnect loop<br>PR #419 Sanitise inline styles<br>PR #420 Layout preset persistence</p>'
  },
  {
    from: '"Tom Baker" <tom@fieldnotes.co>',
    to: 'jamie@example.com',
    subject: 'Coffee next week?',
    date: 'Mon, 06 Jul 2026 16:20:00 +0100',
    read: true,
    starred: false,
    html: "<p>I'm in town Tuesday and Wednesday — would be good to catch up if you're free. Your call on where.</p>"
  },
  {
    from: '"Sam Okafor" <sam@bramblewood.org>',
    to: 'jamie@example.com',
    subject: 'Workshop bookings for autumn',
    date: 'Mon, 06 Jul 2026 11:05:00 +0100',
    read: true,
    starred: true,
    html: "<p>We'd love to run the 3D printing session again — are the October dates still open? Happy to work around your schedule.</p>"
  }
]

export async function seedDemo(db: DB): Promise<void> {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username, colour)
     VALUES ('Demo Mailbox','jamie@example.com','imap','imap.example.com',993,'ssl','smtp.example.com',465,'ssl','jamie@example.com','#1e7a38')`
  )
  const accountId = (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  ensureDefaultSignature(db, accountId, 'Jamie')
  const inboxId = upsertFolder(db, accountId, 'Inbox', 'inbox', 'INBOX')
  upsertFolder(db, accountId, 'Sent', 'sent', 'Sent')
  upsertFolder(db, accountId, 'Drafts', 'drafts', 'Drafts')
  upsertFolder(db, accountId, 'Archive', 'archive', 'Archive')
  upsertFolder(db, accountId, 'Junk', 'junk', 'Junk')
  upsertFolder(db, accountId, 'Bin', 'trash', 'Trash')

  let uid = 100
  for (const e of EMAILS) {
    await ingestRaw(
      db,
      { accountId, folderId: inboxId, remoteUid: uid++, isRead: e.read, isStarred: e.starred },
      rawEmail(e)
    )
  }
  // A calendar-invite email so the invite card + Accept can be demoed/tested.
  await ingestRaw(db, { accountId, folderId: inboxId, remoteUid: uid++, isRead: false, isStarred: false }, inviteEmail())

  // An obvious spam email — the junk filter should auto-move it to Junk.
  const spamId = await ingestRaw(
    db,
    { accountId, folderId: inboxId, remoteUid: uid++, isRead: false, isStarred: false },
    rawEmail({
      from: '"Prize Team" <no-reply@rewards.click>',
      to: 'jamie@example.com',
      subject: 'CONGRATULATIONS YOU WON a $1000 gift card!!!',
      date: 'Tue, 07 Jul 2026 06:00:00 +0100',
      html: '<p>You have been selected as a winner. Claim your prize now — act now to receive your gift card and unclaimed funds.</p>'
    })
  )
  applyJunkIfSpam(db, spamId, true)
  refreshFolderCounts(db, inboxId)
}

// Seed only when asked and the DB is empty.
export async function maybeSeedDemo(db: DB): Promise<void> {
  if (process.env.DESKMAIL_SEED_DEMO !== '1') return
  const count = (db.get('SELECT COUNT(*) c FROM accounts') as { c: number }).c
  if (count === 0) await seedDemo(db)
}
