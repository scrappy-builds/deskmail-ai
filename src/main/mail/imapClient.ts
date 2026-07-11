import { ImapFlow } from 'imapflow'
import type { AccountRow } from '@shared/db'

// Build an ImapFlow client for an account. Short timeouts so a dead server
// doesn't hang the sync or the action drainer.
export function buildImapClient(acc: AccountRow, password: string): ImapFlow {
  return new ImapFlow({
    host: acc.incoming_host,
    port: acc.incoming_port,
    secure: acc.incoming_security === 'ssl',
    auth: { user: acc.username, pass: password },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 30000
  })
}
