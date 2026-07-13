import { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'

// Build an ImapFlow client for an account. Short timeouts so a dead server
// doesn't hang the sync or the action drainer.
export function buildImapClient(acc: AccountRow, password: string): ImapFlow {
  const client = new ImapFlow({
    host: acc.incoming_host,
    port: acc.incoming_port,
    secure: acc.incoming_security === 'ssl',
    auth: { user: acc.username, pass: password },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 30000
  })
  // ImapFlow is an EventEmitter: an unhandled 'error' (e.g. "Socket timeout" on
  // an idle pooled connection) becomes an uncaught exception and crashes the
  // whole main process. A default listener keeps it a normal, recoverable event —
  // callers that care add their own listener on top (both fire).
  client.on('error', () => {})
  return client
}
