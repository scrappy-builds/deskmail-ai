import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { listMessages } from '../../src/db/messages'
import { pendingActions, queueAppend } from '../../src/db/mailActions'
import { buildMail, buildRaw } from '../../src/main/mail/send'
import { appendToSent } from '../../src/main/mail/appendSent'
import { drainMailActions } from '../../src/main/mail/drainer'
import { closePool } from '../../src/main/mail/connectionPool'

// Unit tests run outside Electron — substitute a pass-through safeStorage so the
// credential store round-trips plaintext.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

// Everything reaches IMAP through the pool, which builds clients here — swap in
// the current fake.
let fakeClient: FakeClient
vi.mock('../../src/main/mail/imapClient', () => ({
  buildImapClient: () => fakeClient
}))

interface FakeClient {
  usable: boolean
  connect: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  mailboxCreate: ReturnType<typeof vi.fn>
  append: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  getMailboxLock: ReturnType<typeof vi.fn>
}

function makeFakeClient(opts: { failConnect?: boolean } = {}): FakeClient {
  const c: FakeClient = {
    usable: false,
    connect: vi.fn(async () => {
      if (opts.failConnect) throw new Error('server unreachable')
      c.usable = true
    }),
    on: vi.fn(),
    mailboxCreate: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => ({ release: () => {} }))
  }
  return c
}

function seedAccount(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Alex','alex@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','alex@example.com')`
  )
  db.run('INSERT INTO credentials (account_id, secret_enc) VALUES (1, ?)', [Buffer.from('pw', 'utf-8')])
}

const PAYLOAD = {
  accountId: 1,
  to: ['maya@northwind.studio'],
  cc: [],
  bcc: [],
  subject: 'Bracket drawing',
  bodyHtml: '<p>Drawing attached below the fold.</p>'
}

async function rawFor(payload = PAYLOAD, signature: string | null = null): Promise<Buffer> {
  return buildRaw(buildMail({ payload, fromName: 'Alex', fromEmail: 'alex@example.com', signature }))
}

describe('save sent mail', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    closePool() // fresh pool per test — fakeClient changes between tests
    dir = mkdtempSync(join(tmpdir(), 'deskmail-sent-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seedAccount(db)
  })
  afterEach(() => {
    closePool()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('builds a raw RFC822 copy that round-trips the compose payload', async () => {
    const raw = (await rawFor(PAYLOAD, 'Alex\nExample Co')).toString('utf-8')
    expect(raw).toContain('To: maya@northwind.studio')
    expect(raw).toContain('Subject: Bracket drawing')
    expect(raw).toContain('Drawing attached below the fold')
    // Unfold quoted-printable soft line breaks before matching the signature.
    expect(raw.replace(/=\r?\n/g, '')).toContain('Example Co')
  })

  it('appends to the Sent mailbox and stores a read local copy', async () => {
    fakeClient = makeFakeClient()
    await appendToSent(db, 1, await rawFor(), join(dir, 'spool'))

    expect(fakeClient.append).toHaveBeenCalledTimes(1)
    expect(fakeClient.append.mock.calls[0][0]).toBe('Sent')
    const sentFolder = (db.get("SELECT id FROM folders WHERE role = 'sent'") as { id: number }).id
    const list = listMessages(db, sentFolder)
    expect(list).toHaveLength(1)
    expect(list[0].subject).toBe('Bracket drawing')
    expect(list[0].isRead).toBe(true)
    expect(pendingActions(db)).toHaveLength(0)
  })

  it('append failure spools a retry and never throws — the send already succeeded', async () => {
    fakeClient = makeFakeClient({ failConnect: true })
    const spool = join(dir, 'spool')
    await expect(appendToSent(db, 1, await rawFor(), spool)).resolves.toBeUndefined()

    // Local copy still stored; retry queued with the spooled file.
    const sentFolder = (db.get("SELECT id FROM folders WHERE role = 'sent'") as { id: number }).id
    expect(listMessages(db, sentFolder)).toHaveLength(1)
    const pending = pendingActions(db)
    expect(pending).toHaveLength(1)
    expect(pending[0].op).toBe('append')
    expect(existsSync(pending[0].source_path!)).toBe(true)
    expect(readdirSync(spool)).toHaveLength(1)
  })

  it('the drainer replays a queued append and cleans up the spool file', async () => {
    fakeClient = makeFakeClient({ failConnect: true })
    const spool = join(dir, 'spool')
    await appendToSent(db, 1, await rawFor(), spool)
    const spoolPath = pendingActions(db)[0].source_path!

    closePool() // the failed connection attempt is gone; server "recovers"
    fakeClient = makeFakeClient()
    const resolved = await drainMailActions(db)
    expect(resolved).toBe(1)
    expect(fakeClient.append).toHaveBeenCalledTimes(1)
    expect(fakeClient.append.mock.calls[0][0]).toBe('Sent')
    expect(pendingActions(db)).toHaveLength(0)
    expect(existsSync(spoolPath)).toBe(false)
  })

  it('queueAppend rows are pending and carry both paths', () => {
    queueAppend(db, 1, 'C:/spool/x.eml', 'Sent')
    const p = pendingActions(db)
    expect(p).toHaveLength(1)
    expect(p[0].source_path).toBe('C:/spool/x.eml')
    expect(p[0].target_path).toBe('Sent')
  })
})
