import net from 'node:net'
import tls from 'node:tls'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { ConnectionConfig, TestResult } from '@shared/db'

const OK: TestResult = { ok: true, code: 'ok', message: 'Connected and signed in.' }

// --- Pure classifiers (unit-tested) --------------------------------------------
// Turn a thrown connection error into one of the FEATURE_SPEC states.

export function classifyImapError(err: unknown): TestResult {
  const e = err as { authenticationFailed?: boolean; responseText?: string; message?: string }
  const text = `${e?.responseText ?? ''} ${e?.message ?? ''}`.toLowerCase()
  if (e?.authenticationFailed || text.includes('auth') || text.includes('login') || text.includes('credentials')) {
    return { ok: false, code: 'auth', message: 'Authentication failed — check the username and password.' }
  }
  return { ok: false, code: 'server', message: 'Server settings incorrect — check the host, port and security.' }
}

export function classifySmtpError(err: unknown): TestResult {
  const e = err as { code?: string; responseCode?: number; message?: string }
  if (e?.code === 'EAUTH' || e?.responseCode === 535 || e?.responseCode === 534) {
    return { ok: false, code: 'auth', message: 'Authentication failed — check the username and password.' }
  }
  return { ok: false, code: 'server', message: 'Server settings incorrect — check the host, port and security.' }
}

// --- Live tests ----------------------------------------------------------------

export async function testIncoming(cfg: ConnectionConfig): Promise<TestResult> {
  if (cfg.type === 'pop3') return testPop3Reachable(cfg)

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === 'ssl',
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
    // Give up reasonably quickly rather than hanging the wizard.
    socketTimeout: 15000
  })
  client.on('error', () => {}) // don't let a socket 'error' crash the main process
  try {
    await client.connect()
    await client.logout()
    return OK
  } catch (err) {
    try {
      await client.close()
    } catch {
      /* already down */
    }
    return classifyImapError(err)
  }
}

export async function testOutgoing(cfg: ConnectionConfig): Promise<TestResult> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === 'ssl',
    requireTLS: cfg.security === 'starttls',
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 15000
  })
  try {
    await transport.verify()
    return OK
  } catch (err) {
    return classifySmtpError(err)
  }
}

// POP3: no client library yet (POP3 sync is optional, Stage 5). For now just
// confirm the server is reachable on the given port/security so the wizard can
// give useful feedback. ponytail: reachability only; full POP3 auth test lands with POP3 sync.
function testPop3Reachable(cfg: ConnectionConfig): Promise<TestResult> {
  return new Promise((resolve) => {
    const onError = (): void => resolve({ ok: false, code: 'server', message: 'Couldn’t reach the POP3 server — check the host, port and security.' })
    const onConnect = (socket: net.Socket | tls.TLSSocket): void => {
      socket.destroy()
      resolve({ ok: true, code: 'ok', message: 'Reached the POP3 server. (Sign-in is verified once POP3 sync is enabled.)' })
    }
    const socket =
      cfg.security === 'ssl'
        ? tls.connect({ host: cfg.host, port: cfg.port, timeout: 15000 }, () => onConnect(socket))
        : net.connect({ host: cfg.host, port: cfg.port, timeout: 15000 }, () => onConnect(socket))
    socket.on('error', onError)
    socket.on('timeout', onError)
  })
}
