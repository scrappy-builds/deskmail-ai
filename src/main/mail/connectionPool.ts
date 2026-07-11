import type { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { buildImapClient } from './imapClient'

// One kept-alive IMAP connection per account, shared by sync, the action
// drainer, the Sent-folder append and attachment downloads — instead of a
// connect/logout round-trip per operation. Callers are serialised per account
// (IMAP connections aren't safe to use concurrently across mailboxes); the
// connection closes itself after 5 minutes idle and reconnects transparently
// (one retry) if the socket dropped between uses.

const IDLE_CLOSE_MS = 5 * 60 * 1000

interface Entry {
  client: ImapFlow | null
  chain: Promise<unknown>
  closeTimer: ReturnType<typeof setTimeout> | null
}

const pool = new Map<number, Entry>()

async function ensureConnected(db: DB, accountId: number, entry: Entry): Promise<ImapFlow> {
  if (entry.client?.usable) return entry.client
  entry.client = null
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
  if (!acc || acc.incoming_type !== 'imap') throw new Error('Not an IMAP account.')
  const password = getCredential(db, accountId)
  if (!password) throw new Error('No stored password for this account.')
  const client = buildImapClient(acc, password)
  await client.connect()
  client.on('close', () => {
    if (entry.client === client) entry.client = null
  })
  entry.client = client
  return client
}

function scheduleIdleClose(entry: Entry): void {
  if (entry.closeTimer) clearTimeout(entry.closeTimer)
  entry.closeTimer = setTimeout(() => {
    const c = entry.client
    entry.client = null
    if (c)
      void c.logout().catch(() => {
        try {
          c.close()
        } catch {
          /* already down */
        }
      })
  }, IDLE_CLOSE_MS)
  entry.closeTimer.unref?.()
}

// Run fn with the account's pooled connection. Throws if the server is
// unreachable — callers keep their existing "leave it for next cycle" handling.
export async function withConnection<T>(db: DB, accountId: number, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  let entry = pool.get(accountId)
  if (!entry) {
    entry = { client: null, chain: Promise.resolve(), closeTimer: null }
    pool.set(accountId, entry)
  }
  const e = entry

  const run = async (): Promise<T> => {
    if (e.closeTimer) {
      clearTimeout(e.closeTimer)
      e.closeTimer = null
    }
    try {
      const client = await ensureConnected(db, accountId, e)
      try {
        return await fn(client)
      } catch (err) {
        // The socket died mid-operation → reconnect and retry once; a real
        // (server-reported) error rethrows unchanged.
        if (client.usable) throw err
        const fresh = await ensureConnected(db, accountId, e)
        return await fn(fresh)
      }
    } finally {
      scheduleIdleClose(e)
    }
  }

  // Serialise per account: each caller queues behind the previous one,
  // regardless of whether it succeeded.
  const result = e.chain.then(run, run)
  e.chain = result.catch(() => {})
  return result
}

// Log out every pooled connection (app quit, tests).
export function closePool(): void {
  for (const entry of pool.values()) {
    if (entry.closeTimer) clearTimeout(entry.closeTimer)
    const c = entry.client
    entry.client = null
    if (c)
      void c.logout().catch(() => {
        try {
          c.close()
        } catch {
          /* already down */
        }
      })
  }
  pool.clear()
}
