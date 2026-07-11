import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { backoffDelayMs, isIdleHealthy, startIdle, stopAllIdle } from '../../src/main/mail/idle'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

let fakeClient: FakeIdleClient
vi.mock('../../src/main/mail/imapClient', () => ({
  buildImapClient: () => fakeClient
}))

interface FakeIdleClient {
  handlers: Map<string, (() => void)[]>
  emit: (ev: string) => void
  connect: ReturnType<typeof vi.fn>
  mailboxOpen: ReturnType<typeof vi.fn>
  on: (ev: string, cb: () => void) => void
  noop: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakeIdle(): FakeIdleClient {
  const handlers = new Map<string, (() => void)[]>()
  const c: FakeIdleClient = {
    handlers,
    emit: (ev) => (handlers.get(ev) ?? []).forEach((h) => h()),
    connect: vi.fn(async () => {}),
    mailboxOpen: vi.fn(async () => {}),
    on: (ev, cb) => handlers.set(ev, [...(handlers.get(ev) ?? []), cb]),
    noop: vi.fn(async () => {}),
    logout: vi.fn(async () => {
      c.emit('close')
    }),
    close: vi.fn(() => {})
  }
  return c
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('imap idle', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-idle-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Alex','alex@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','alex@example.com')`
    )
    db.run('INSERT INTO credentials (account_id, secret_enc) VALUES (1, ?)', [Buffer.from('pw', 'utf-8')])
  })
  afterEach(async () => {
    stopAllIdle()
    await tick() // let the loop observe the stop before the DB closes
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('backoff doubles from 5s and caps at 5 minutes', () => {
    expect(backoffDelayMs(0)).toBe(5000)
    expect(backoffDelayMs(1)).toBe(10000)
    expect(backoffDelayMs(2)).toBe(20000)
    expect(backoffDelayMs(10)).toBe(5 * 60 * 1000)
  })

  it("an 'exists' event triggers the targeted sync callback", async () => {
    fakeClient = fakeIdle()
    const onNewMail = vi.fn()
    startIdle(db, 1, onNewMail)
    await tick()
    expect(isIdleHealthy(1)).toBe(true)
    fakeClient.emit('exists')
    fakeClient.emit('exists')
    expect(onNewMail).toHaveBeenCalledTimes(2)
  })

  it('a dropped connection marks the account unhealthy (poll fallback resumes)', async () => {
    fakeClient = fakeIdle()
    startIdle(db, 1, () => {})
    await tick()
    expect(isIdleHealthy(1)).toBe(true)
    fakeClient.emit('close')
    await tick()
    expect(isIdleHealthy(1)).toBe(false)
  })

  it('startIdle is a no-op while the account is already idling', async () => {
    fakeClient = fakeIdle()
    startIdle(db, 1, () => {})
    await tick()
    startIdle(db, 1, () => {})
    await tick()
    expect(fakeClient.connect).toHaveBeenCalledTimes(1)
  })
})
