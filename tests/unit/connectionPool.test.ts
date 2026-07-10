import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImapFlow } from 'imapflow'
import { openDatabase, type DB } from '../../src/db/database'
import { closePool, withConnection } from '../../src/main/mail/connectionPool'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

// The pool asks this factory for clients; hand out scripted fakes in order.
let clients: FakeClient[] = []
vi.mock('../../src/main/mail/imapClient', () => ({
  buildImapClient: () => {
    const c = clients.shift()
    if (!c) throw new Error('test ran out of scripted clients')
    return c
  }
}))

interface FakeClient {
  usable: boolean
  connect: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fake(): FakeClient {
  const c: FakeClient = {
    usable: false,
    connect: vi.fn(async () => {
      c.usable = true
    }),
    on: vi.fn(),
    logout: vi.fn(async () => {
      c.usable = false
    }),
    close: vi.fn(async () => {})
  }
  return c
}

describe('imap connection pool', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    closePool()
    clients = []
    dir = mkdtempSync(join(tmpdir(), 'deskmail-pool-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Jamie','jamie@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','jamie@example.com')`
    )
    db.run('INSERT INTO credentials (account_id, secret_enc) VALUES (1, ?)', [Buffer.from('pw', 'utf-8')])
  })
  afterEach(() => {
    closePool()
    vi.useRealTimers()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reuses one connection across sequential calls', async () => {
    const c = fake()
    clients = [c]
    await withConnection(db, 1, async () => 'a')
    const out = await withConnection(db, 1, async () => 'b')
    expect(out).toBe('b')
    expect(c.connect).toHaveBeenCalledTimes(1)
  })

  it('serialises concurrent callers per account', async () => {
    clients = [fake()]
    const order: string[] = []
    let releaseFirst!: () => void
    const gate = new Promise<void>((r) => (releaseFirst = r))

    const first = withConnection(db, 1, async () => {
      order.push('first-start')
      await gate
      order.push('first-end')
    })
    const second = withConnection(db, 1, async () => {
      order.push('second-start')
    })
    // Give the second caller every chance to jump the queue before releasing.
    await new Promise((r) => setTimeout(r, 20))
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first-start', 'first-end', 'second-start'])
  })

  it('closes the connection after the idle window and reconnects on next use', async () => {
    vi.useFakeTimers()
    const c1 = fake()
    const c2 = fake()
    clients = [c1, c2]
    await withConnection(db, 1, async () => {})
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10)
    expect(c1.logout).toHaveBeenCalledTimes(1)
    await withConnection(db, 1, async () => {})
    expect(c2.connect).toHaveBeenCalledTimes(1)
  })

  it('reconnects and retries once when the socket died mid-operation', async () => {
    const c1 = fake()
    const c2 = fake()
    clients = [c1, c2]
    let attempts = 0
    const out = await withConnection(db, 1, async (client) => {
      attempts++
      if (attempts === 1) {
        ;(client as unknown as FakeClient).usable = false // socket dropped
        throw new Error('broken pipe')
      }
      return 'recovered'
    })
    expect(out).toBe('recovered')
    expect(attempts).toBe(2)
    expect(c2.connect).toHaveBeenCalledTimes(1)
  })

  it('a server-reported error (socket still fine) is not retried', async () => {
    clients = [fake()]
    let attempts = 0
    await expect(
      withConnection(db, 1, async () => {
        attempts++
        throw new Error('NO such mailbox')
      })
    ).rejects.toThrow('NO such mailbox')
    expect(attempts).toBe(1)
  })

  it('throws for an account with no stored password', async () => {
    db.run('DELETE FROM credentials')
    await expect(withConnection(db, 1, async () => {})).rejects.toThrow(/password/i)
  })
})

// The fake stands in for ImapFlow — keep the compiler honest about the shape we use.
const _typecheck: (c: FakeClient) => ImapFlow = (c) => c as unknown as ImapFlow
void _typecheck
