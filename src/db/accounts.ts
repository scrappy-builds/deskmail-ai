import type { AccountInput, AccountRow, AccountSummary } from '@shared/db'
import type { DB } from './database'

// A small palette so each account gets a distinct dot in the sidebar.
const COLOURS = ['#1e7a38', '#bf8420', '#2f6fae', '#8a4fbf', '#b0442f', '#1a8a7a']

export function listAccounts(db: DB): AccountSummary[] {
  const rows = db.all('SELECT id, display_name, email_address, colour FROM accounts ORDER BY id') as unknown as Pick<
    AccountRow,
    'id' | 'display_name' | 'email_address' | 'colour'
  >[]
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    emailAddress: r.email_address,
    colour: r.colour
  }))
}

// Inserts the account and returns its new id. Credentials are stored separately
// (encrypted) by the caller — never in this table.
export function insertAccount(db: DB, a: AccountInput): number {
  const count = (db.get('SELECT COUNT(*) c FROM accounts') as { c: number }).c
  const colour = COLOURS[count % COLOURS.length]
  db.run(
    `INSERT INTO accounts (
       display_name, email_address, incoming_type, incoming_host, incoming_port, incoming_security,
       outgoing_host, outgoing_port, outgoing_security, username, colour
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.displayName,
      a.emailAddress,
      a.incomingType,
      a.incomingHost,
      a.incomingPort,
      a.incomingSecurity,
      a.outgoingHost,
      a.outgoingPort,
      a.outgoingSecurity,
      a.username,
      colour
    ]
  )
  return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
}

// Full editable details for one account (password NOT included — it lives
// encrypted in `credentials`; the IPC layer fills it in from there).
export function getAccount(db: DB, id: number): AccountInput | null {
  const r = db.get('SELECT * FROM accounts WHERE id = ?', [id]) as unknown as AccountRow | undefined
  if (!r) return null
  return {
    displayName: r.display_name,
    emailAddress: r.email_address,
    incomingType: r.incoming_type as AccountInput['incomingType'],
    incomingHost: r.incoming_host,
    incomingPort: r.incoming_port,
    incomingSecurity: r.incoming_security as AccountInput['incomingSecurity'],
    outgoingHost: r.outgoing_host,
    outgoingPort: r.outgoing_port,
    outgoingSecurity: r.outgoing_security as AccountInput['outgoingSecurity'],
    username: r.username,
    password: ''
  }
}

// Updates the server/identity fields. Credentials are handled separately by the
// caller (re-encrypted only when the user actually typed a new password).
export function updateAccount(db: DB, id: number, a: AccountInput): void {
  db.run(
    `UPDATE accounts SET
       display_name = ?, email_address = ?, incoming_type = ?, incoming_host = ?,
       incoming_port = ?, incoming_security = ?, outgoing_host = ?, outgoing_port = ?,
       outgoing_security = ?, username = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      a.displayName,
      a.emailAddress,
      a.incomingType,
      a.incomingHost,
      a.incomingPort,
      a.incomingSecurity,
      a.outgoingHost,
      a.outgoingPort,
      a.outgoingSecurity,
      a.username,
      id
    ]
  )
}
