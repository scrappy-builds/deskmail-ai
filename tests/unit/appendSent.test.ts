import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImapFlow } from 'imapflow'
import { openDatabase, type DB } from '../../src/db/database'
import { listMessages } from '../../src/db/messages'
import { pendingActions } from '../../src/db/mailActions'
import { buildMail, buildRaw } from '../../src/main/mail/send'
import { appendToSent } from '../../src/main/mail/appendSent'
import { drainMailActions } from '../../src/main/mail/drainer'
import { queueAppend } from '../../src/db/mailActions'

// Unit tests run outside Electron — substitute a pass-through safeStorage so the
// credential store round-trips plaintext.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

// The drainer builds its own client — swap it for the shared fake.
let fakeClient: FakeClient
vi.mock('../../src/main/mail/imapClient', () => ({
  buildImapClient: () => fakeClient
}))

interface FakeClient {
  connect: ReturnType<typeof vi.fn>
  mailboxCreate: ReturnType<typeof vi.fn>
  append: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  getMailboxLock: ReturnType<typeof vi.fn>
}

function makeFakeClient(opts: { failConnect?: boolean } = {}): FakeClient {
  return {
    connect: vi.fn(async () => {
      if (opts.failConnect) throw new Error('server unreachable')
    }),
    mailboxCreate: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => ({ release: () => {} }))
  }
}

function seedAccount(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Jamie','jamie@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','jamie@example.com')`
  )
  db.run("INSERT INTO credentials (account_id, secret_enc) VALUES (1, ?)", [Buffer.from('pw', 'utf-8')])
}

const PAYLOAD = {
  accountId: 1,
  to: ['maya@northwind.studio'],
  cc: [],
  bcc: [],
  subject: 'Bracket drawing',
  bodyHtml: '<p>Drawing attached below the fold.</p>'
}

describe('save sent mail', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-sent-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seedAccount(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('builds a raw RFC822 copy that round-trips the compose payload', async () => {
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Jamie', fromEmail: 'jamie@example.com', signature: 'Jamie\nFunctional 3D UK' })
    const raw = (await buildRaw(mail)).toString('utf-8')
    expect(raw).toContain('To: maya@northwind.studio')
    expect(raw).toContain('Subject: Bracket drawing')
    expect(raw).toContain('Drawing attached below the fold')
    // Unfold quoted-printable soft line breaks before matching the signature.
    expect(raw.replace(/=\r?\n/g, '')).toContain('Functional 3D UK')
  })

  it('appends to the Sent mailbox and stores a read local copy', async () => {
    const client = makeFakeClient()
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Jamie', fromEmail: 'jamie@example.com', signature: null })
    await appendToSent(db, 1, await buildRaw(mail), join(dir, 'spool'), () => client as unknown as ImapFlow)

    expect(client.append).toHaveBeenCalledTimes(1)
    expect(client.append.mock.calls[0][0]).toBe('Sent')
    const sentFolder = (db.get("SELECT id FROM folders WHERE role = 'sent'") as { id: number }).id
    const list = listMessages(db, sentFolder)
    expect(list).toHaveLength(1)
    expect(list[0].subject).toBe('Bracket drawing')
    expect(list[0].isRead).toBe(true)
    expect(pendingActions(db)).toHaveLength(0)
  })

  it('append failure spools a retry and never throws — the send already succeeded', async () => {
    const client = makeFakeClient({ failConnect: true })
    const spool = join(dir, 'spool')
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Jamie', fromEmail: 'jamie@example.com', signature: null })
    await expect(appendToSent(db, 1, await buildRaw(mail), spool, () => client as unknown as ImapFlow)).resolves.toBeUndefined()

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
    fakeClient = makeFakeClient()
    const spool = join(dir, 'spool')
    const failing = makeFakeClient({ failConnect: true })
    const mail = buildMail({ payload: PAYLOAD, fromName: 'Jamie', fromEmail: 'jamie@example.com', signature: null })
    await appendToSent(db, 1, await buildRaw(mail), spool, () => failing as unknown as ImapFlow)
    const spoolPath = pendingActions(db)[0].source_path!

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
