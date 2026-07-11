import type { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { buildImapClient } from './imapClient'

// IMAP IDLE: a dedicated connection per account sits on INBOX and the server
// tells us when mail arrives — instant notifications instead of the poll.
// Deliberately OUTSIDE the connection pool: this connection is permanently busy.
// The periodic poll stays as the fallback (it skips accounts whose IDLE
// connection is currently healthy — see isIdleHealthy).

const BASE_BACKOFF_MS = 5000
const CAP_BACKOFF_MS = 5 * 60 * 1000
// RFC 2177 says servers may drop IDLE at 30 min; re-poke well before that.
const POKE_MS = 25 * 60 * 1000

// Pure: reconnect delay for the nth consecutive failure (0-based).
export function backoffDelayMs(attempt: number): number {
  return Math.min(CAP_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt)
}

interface IdleState {
  stopped: boolean
  healthy: boolean
  client: ImapFlow | null
}

const states = new Map<number, IdleState>()

// The poll skips an account while its IDLE connection is alive — new mail
// already arrives instantly, so re-fetching every 2 minutes is redundant.
export function isIdleHealthy(accountId: number): boolean {
  return states.get(accountId)?.healthy ?? false
}

export function startIdle(db: DB, accountId: number, onNewMail: () => void): void {
  if (states.has(accountId)) return
  const state: IdleState = { stopped: false, healthy: false, client: null }
  states.set(accountId, state)
  void runLoop(db, accountId, state, onNewMail)
}

export function stopAllIdle(): void {
  for (const state of states.values()) {
    state.stopped = true
    state.healthy = false
    const c = state.client
    state.client = null
    if (c)
      void c.logout().catch(() => {
        try {
          c.close()
        } catch {
          /* already down */
        }
      })
  }
  states.clear()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    t.unref?.()
  })
}

async function runLoop(db: DB, accountId: number, state: IdleState, onNewMail: () => void): Promise<void> {
  let attempt = 0
  while (!state.stopped) {
    const acc = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]) as unknown as AccountRow | undefined
    const password = acc ? getCredential(db, accountId) : null
    if (!acc || acc.incoming_type !== 'imap' || !password) {
      states.delete(accountId) // account gone or unusable — give up quietly
      return
    }

    const client = buildImapClient(acc, password)
    state.client = client
    try {
      await client.connect()
      await client.mailboxOpen('INBOX')
      state.healthy = true
      attempt = 0
      client.on('exists', () => onNewMail())

      // Hold the connection until it drops; imapflow re-enters IDLE by itself,
      // and a periodic NOOP guards against servers that time silent connections out.
      await new Promise<void>((resolve) => {
        const poke = setInterval(() => void client.noop().catch(() => {}), POKE_MS)
        ;(poke as { unref?: () => void }).unref?.()
        const done = (): void => {
          clearInterval(poke)
          resolve()
        }
        client.on('close', done)
        client.on('error', done)
      })
    } catch {
      /* connect/open failed — fall through to backoff */
    }
    state.healthy = false
    state.client = null
    try {
      client.close()
    } catch {
      /* already down */
    }
    if (state.stopped) return
    await sleep(backoffDelayMs(attempt++))
  }
}
