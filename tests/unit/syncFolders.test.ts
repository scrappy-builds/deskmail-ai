import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { findFolderByRole } from '../../src/db/folders'
import { getFolderCursor } from '../../src/db/folderSync'
import { listMessages, upsertMessage } from '../../src/db/messages'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

// A tiny in-memory IMAP server the sync code drives through the pooled client.
interface FakeMsg { uid: number; flags: Set<string>; source: Buffer; internalDate: Date }
interface FakeMailbox { path: string; name: string; specialUse?: string; uidValidity: number; messages: FakeMsg[] }

function rawMessage(uid: number, date: Date): Buffer {
  return Buffer.from(
    `From: Sender ${uid} <s${uid}@northwind.test>\r\n` +
      `To: alex@example.com\r\n` +
      `Subject: Message ${uid}\r\n` +
      `Message-ID: <${uid}@northwind.test>\r\n` +
      `Date: ${date.toUTCString()}\r\n\r\n` +
      `Body of message ${uid}.\r\n`
  )
}

function makeMailbox(path: string, name: string, count: number, uidValidity = 10, specialUse?: string): FakeMailbox {
  const messages: FakeMsg[] = []
  for (let uid = 1; uid <= count; uid++) {
    messages.push({ uid, flags: new Set(), source: rawMessage(uid, new Date(2026, 0, uid)), internalDate: new Date(2026, 0, uid) })
  }
  return { path, name, specialUse, uidValidity, messages }
}

class FakeServer {
  boxes = new Map<string, FakeMailbox>()
  add(mb: FakeMailbox): void { this.boxes.set(mb.path, mb) }
}

let server: FakeServer
let currentLock: FakeMailbox | null = null

function makeClient(): unknown {
  const client: Record<string, unknown> = {
    usable: false,
    mailbox: false as unknown,
    connect: vi.fn(async () => { client.usable = true }),
    on: vi.fn(),
    logout: vi.fn(async () => { client.usable = false }),
    close: vi.fn(async () => {}),
    list: vi.fn(async () => [...server.boxes.values()].map((b) => ({ name: b.name, path: b.path, specialUse: b.specialUse }))),
    getMailboxLock: vi.fn(async (path: string) => {
      const mb = server.boxes.get(path)
      if (!mb) throw new Error(`no mailbox ${path}`)
      currentLock = mb
      const maxUid = mb.messages.reduce((m, x) => Math.max(m, x.uid), 0)
      client.mailbox = { uidValidity: mb.uidValidity, uidNext: maxUid + 1, exists: mb.messages.length }
      return { release: () => { currentLock = null } }
    }),
    fetch: (range: string, _query: unknown, options?: { uid?: boolean }) => {
      const mb = currentLock
      const byUid = options?.uid === true
      const msgs = mb ? [...mb.messages].sort((a, b) => a.uid - b.uid) : []
      const m = /^(\d+):(\d+|\*)$/.exec(range)
      let selected: FakeMsg[] = []
      if (m) {
        const lo = Number(m[1])
        const hiStr = m[2]
        if (byUid) {
          const hi = hiStr === '*' ? Infinity : Number(hiStr)
          selected = msgs.filter((x) => x.uid >= lo && x.uid <= hi)
        } else {
          const hi = hiStr === '*' ? msgs.length : Number(hiStr)
          selected = msgs.slice(lo - 1, hi)
        }
      }
      return (async function* () {
        for (const x of selected) yield { uid: x.uid, flags: x.flags, source: x.source, internalDate: x.internalDate }
      })()
    }
  }
  return client
}

vi.mock('../../src/main/mail/imapClient', () => ({ buildImapClient: () => makeClient() }))

// Import after the mocks are registered.
import { backfillFolder, syncAccount } from '../../src/main/mail/sync'
import { closePool } from '../../src/main/mail/connectionPool'

describe('full mail sync — all folders, incremental, back-fill', () => {
  let dir: string
  let db: DB
  let inboxId: number
  let sentId: number
  beforeEach(() => {
    closePool()
    server = new FakeServer()
    dir = mkdtempSync(join(tmpdir(), 'deskmail-sync-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Alex','alex@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','alex@example.com')`
    )
    db.run('INSERT INTO credentials (account_id, secret_enc) VALUES (1, ?)', [Buffer.from('pw', 'utf-8')])
  })
  afterEach(() => {
    closePool()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function ids(): void {
    inboxId = findFolderByRole(db, 1, 'inbox')!.id
    sentId = findFolderByRole(db, 1, 'sent')!.id
  }

  it('seeds the newest page per folder, then back-fills older mail on demand', { timeout: 20000 }, async () => {
    server.add(makeMailbox('INBOX', 'Inbox', 60))
    server.add(makeMailbox('Sent', 'Sent', 4, 10, '\\Sent'))

    const r = await syncAccount(db, 1)
    expect(r.ok).toBe(true)
    ids()

    // INBOX seeded newest 50 (uids 11..60); Sent's 4 all fit in one page.
    expect(listMessages(db, inboxId)).toHaveLength(50)
    expect(listMessages(db, sentId)).toHaveLength(4)
    const cur = getFolderCursor(db, inboxId)!
    expect(cur.lastSeenUid).toBe(60)
    expect(cur.backfillLowUid).toBe(11)

    // Load older → the remaining 10 (uids 1..10) arrive; floor drops to 1.
    const added = await backfillFolder(db, 1, inboxId)
    expect(added).toBe(10)
    expect(listMessages(db, inboxId)).toHaveLength(60)
    expect(getFolderCursor(db, inboxId)!.backfillLowUid).toBe(1)

    // Nothing left below → back-fill is a no-op.
    expect(await backfillFolder(db, 1, inboxId)).toBe(0)
  })

  it('pulls only new mail above the cursor on a later sync', { timeout: 20000 }, async () => {
    const box = makeMailbox('INBOX', 'Inbox', 5)
    server.add(box)
    await syncAccount(db, 1)
    ids()
    expect(listMessages(db, inboxId)).toHaveLength(5)

    // Two new messages arrive on the server.
    box.messages.push({ uid: 6, flags: new Set(), source: rawMessage(6, new Date()), internalDate: new Date() })
    box.messages.push({ uid: 7, flags: new Set(), source: rawMessage(7, new Date()), internalDate: new Date() })
    await syncAccount(db, 1)
    expect(listMessages(db, inboxId)).toHaveLength(7)
    expect(getFolderCursor(db, inboxId)!.lastSeenUid).toBe(7)
  })

  it('wipes and re-seeds a folder when UIDVALIDITY changes', { timeout: 20000 }, async () => {
    const box = makeMailbox('INBOX', 'Inbox', 5, 10)
    server.add(box)
    await syncAccount(db, 1)
    ids()
    expect(listMessages(db, inboxId)).toHaveLength(5)

    // Server reassigns its UID space (rare, but must be handled).
    box.uidValidity = 999
    await syncAccount(db, 1)
    expect(listMessages(db, inboxId)).toHaveLength(5) // re-seeded, not doubled
    expect(getFolderCursor(db, inboxId)!.uidValidity).toBe(999)
  })

  it('reconciles read/starred flags and moves server-deleted mail to Trash', { timeout: 20000 }, async () => {
    const box = makeMailbox('INBOX', 'Inbox', 5)
    server.add(box)
    await syncAccount(db, 1)
    ids()
    const trashId = findFolderByRole(db, 1, 'trash')!.id
    expect(listMessages(db, inboxId)).toHaveLength(5)

    // On the server: uid 3 gets read, uid 4 gets starred, uid 2 is deleted.
    box.messages.find((m) => m.uid === 3)!.flags.add('\\Seen')
    box.messages.find((m) => m.uid === 4)!.flags.add('\\Flagged')
    box.messages = box.messages.filter((m) => m.uid !== 2)

    await syncAccount(db, 1)

    // uid 2 moved to Trash → inbox 4, trash 1; flag changes reflected locally.
    const inbox = listMessages(db, inboxId)
    expect(inbox).toHaveLength(4)
    expect(listMessages(db, trashId)).toHaveLength(1)
    expect(inbox.find((m) => m.subject === 'Message 3')!.isRead).toBe(true)
    expect(inbox.find((m) => m.subject === 'Message 4')!.isStarred).toBe(true)
  })

  it('dedupes a locally-appended Sent copy once the server copy syncs', { timeout: 20000 }, async () => {
    server.add(makeMailbox('INBOX', 'Inbox', 1))
    // One server-side Sent message with a known Message-ID.
    const sent = makeMailbox('Sent', 'Sent', 0, 10, '\\Sent')
    sent.messages.push({ uid: 1, flags: new Set(), source: rawMessage(1, new Date()), internalDate: new Date() })
    server.add(sent)

    // First sync creates the folder rows and pulls the server's Sent copy.
    await syncAccount(db, 1)
    ids()
    // Insert a local duplicate and re-run: it should be removed, leaving one.
    upsertMessage(db, {
      accountId: 1, folderId: sentId, remoteUid: null, messageIdHeader: '<1@northwind.test>',
      fromName: 'Alex', fromEmail: 'alex@example.com', to: ['x@y.z'], cc: [], bcc: [],
      subject: 'Message 1', snippet: '', bodyText: 'x', bodyHtml: null, receivedAt: null, sentAt: null,
      isRead: true, isStarred: false, importance: null, listUnsubscribe: null, replyTo: null, references: []
    })
    expect(listMessages(db, sentId).length).toBeGreaterThanOrEqual(2)
    await syncAccount(db, 1)
    // The NULL-uid local copy is gone; the server copy (uid 1) remains.
    expect(listMessages(db, sentId)).toHaveLength(1)
  })
})
