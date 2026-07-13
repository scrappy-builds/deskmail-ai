import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/db/database'
import { ingestRaw } from '../../src/main/mail/ingest'

// Drives the REAL built MCP server the way Claude Desktop does — as a separate
// process over stdio, launched via Electron-as-Node against a DeskMail DB. This
// proves the standalone connector actually answers, not just the tool functions.
// Skipped automatically when the app hasn't been built (out/main/mcp-server.js).
const SERVER = join(process.cwd(), 'out', 'main', 'mcp-server.js')
const built = existsSync(SERVER)

// One JSON-RPC round-trip over the server's stdio (newline-delimited JSON).
function rpcClient(proc: ChildProcessWithoutNullStreams) {
  const pending = new Map<number, (v: unknown) => void>()
  let buf = ''
  proc.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown }
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          pending.get(msg.id)!(msg.result)
          pending.delete(msg.id)
        }
      } catch {
        /* not a JSON line */
      }
    }
  })
  let id = 0
  const call = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const myId = ++id
      pending.set(myId, resolve)
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n')
      setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000)
    })
  // A tools/call that unwraps the JSON text content back into an object.
  const callTool = async (name: string, args: Record<string, unknown>): Promise<any> => {
    const res = (await call('tools/call', { name, arguments: args })) as { content: { type: string; text: string }[] }
    return JSON.parse(res.content[0].text)
  }
  return { call, callTool }
}

describe.skipIf(!built)('MCP server (real process, over stdio)', () => {
  let dir: string
  let dbPath: string
  let proc: ChildProcessWithoutNullStreams
  let client: ReturnType<typeof rpcClient>
  let vendorFolderId: number

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-mcpint-'))
    dbPath = join(dir, 'deskmail.db')
    // Seed a real DeskMail DB: one account, Inbox + a custom folder, one message.
    const db = openDatabase(dbPath)
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Alex','alex@example.com','imap','imap.x',993,'ssl','smtp.x',465,'ssl','alex@example.com')`
    )
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Vendors','none','Vendors')")
    vendorFolderId = (db.get("SELECT id FROM folders WHERE name='Vendors'") as { id: number }).id
    await ingestRaw(
      db,
      { accountId: 1, folderId: 1, remoteUid: 1, isRead: false, isStarred: false },
      ['From: "Maya" <maya@northwind.studio>', 'To: alex@example.com', 'Subject: Q3', 'Message-ID: <1@x>', '', 'hi', ''].join('\r\n')
    )
    db.close()

    // Launch exactly like the generated connector config: Electron in Node mode.
    proc = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DESKMAIL_DB: dbPath }
    }) as ChildProcessWithoutNullStreams
    client = rpcClient(proc)
    await client.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  })

  afterAll(() => {
    proc?.kill()
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists exactly the safe tool surface, including the new rule tools', async () => {
    const res = (await client.call('tools/list', {})) as { tools: { name: string }[] }
    const names = res.tools.map((t) => t.name)
    expect(names).toContain('create_rule')
    expect(names).toContain('list_rules')
    expect(names).toContain('delete_rule')
    expect(names).toContain('move_email')
    // The guarantee holds end-to-end: nothing that sends or exposes secrets.
    expect(names.some((n) => /send|permanent|purge|credential|password|secret/i.test(n))).toBe(false)
  })

  it('reads the seeded account and folders', async () => {
    const accounts = await client.callTool('list_accounts', {})
    expect(accounts).toHaveLength(1)
    expect(accounts[0].email_address).toBe('alex@example.com')
    const folders = await client.callTool('list_folders', { account_id: 1 })
    expect(folders.map((f: { name: string }) => f.name)).toEqual(expect.arrayContaining(['Inbox', 'Vendors']))
  })

  it('creates a rule and sweeps the existing message (the reported "apply rule" gap)', async () => {
    const res = await client.callTool('create_rule', { field: 'from', value: 'maya@northwind.studio', action: 'move', target_folder_id: vendorFolderId, apply_now: true })
    expect(res.ok).toBe(true)
    expect(res.applied_to_existing).toBe(1)
    const rules = await client.callTool('list_rules', {})
    expect(rules.some((r: { value: string }) => r.value === 'maya@northwind.studio')).toBe(true)
  })

  it('move_email gives a clear error for a bad folder instead of silently failing', async () => {
    const res = await client.callTool('move_email', { message_id: 1, target_folder_id: 99999 })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/list_folders/i)
  })
})
