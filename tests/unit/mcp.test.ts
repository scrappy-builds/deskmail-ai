import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { ingestRaw } from '../../src/main/mail/ingest'
import { buildTools, type ToolDef } from '../../src/mcp/tools'

function seed(db: DB): void {
  db.run(
    `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
       incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
     VALUES ('Jamie','jamie@f3d.uk','imap','imap.x',993,'ssl','smtp.x',465,'ssl','jamie@f3d.uk')`
  )
  db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX')")
}
function raw(from: string, subject: string, body: string, uid: number): string {
  return ['From: ' + from, 'To: jamie@f3d.uk', 'Subject: ' + subject, 'Date: Tue, 07 Jul 2026 09:00:00 +0100', `Message-ID: <${uid}@x>`, '', body, ''].join('\r\n')
}

const EXPECTED_TOOLS = [
  'list_accounts', 'list_folders', 'search_emails', 'read_email', 'create_draft',
  'find_related_emails', 'find_unanswered_emails', 'extract_dates_and_deadlines', 'summarise_thread_data',
  'move_email', 'archive_email', 'delete_email', 'flag_email', 'mark_email_read',
  'export_for_notebooklm'
].sort()

describe('MCP tool surface', () => {
  let dir: string
  let db: DB
  let tools: ToolDef[]
  const tool = (name: string): ToolDef => tools.find((t) => t.name === name)!

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-mcp-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    seed(db)
    tools = buildTools(db)
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 1, isRead: false, isStarred: false }, raw('"Maya Chen" <maya@northwind.studio>', 'Q3 launch sync', 'Please confirm the timeline. The vendor call is due by Friday 10 July. Can you review the plan?', 1))
    await ingestRaw(db, { accountId: 1, folderId: 1, remoteUid: 2, isRead: true, isStarred: false }, raw('"Maya Chen" <maya@northwind.studio>', 'Re: Q3 launch sync', 'Thanks — see the notes attached.', 2))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('exposes exactly the safe read/draft/manage tools — no send/permanent-delete/credential tools', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS)
    for (const t of tools) {
      // No sending, no permanent deletion, no credential/settings access.
      expect(t.name).not.toMatch(/send|permanent|purge|expunge|credential|password|secret|setting/i)
    }
  })

  it('delete_email moves to Trash (reversible) and never removes the row', () => {
    const before = tool('read_email').handler({ message_id: 1 })
    expect(before).not.toBeNull()
    const r = tool('delete_email').handler({ message_id: 1 }) as { ok: boolean; op: string }
    expect(r).toEqual({ ok: true, op: 'trash' })
    // Still present (in Trash), not permanently gone.
    expect(tool('read_email').handler({ message_id: 1 })).not.toBeNull()
    const trash = db.get("SELECT id FROM folders WHERE role='trash'") as { id: number } | undefined
    const meta = db.get('SELECT folder_id FROM messages WHERE id=1') as { folder_id: number }
    expect(meta.folder_id).toBe(trash!.id)
  })

  it('move/flag/mark actions queue an IMAP op for the app to push', () => {
    tool('archive_email').handler({ message_id: 2 })
    tool('flag_email').handler({ message_id: 2, flagged: true })
    const ops = (db.all('SELECT op FROM mail_actions ORDER BY id') as { op: string }[]).map((r) => r.op)
    expect(ops).toContain('archive')
    expect(ops).toContain('flag')
  })

  it('list_accounts returns the specified shape (no credentials)', () => {
    const [acc] = tool('list_accounts').handler({}) as Record<string, unknown>[]
    expect(Object.keys(acc).sort()).toEqual(['colour', 'display_name', 'email_address', 'id', 'status'])
    expect(JSON.stringify(acc)).not.toMatch(/password|secret/i)
  })

  it('list_folders returns account/name/counts', () => {
    const [f] = tool('list_folders').handler({}) as Record<string, unknown>[]
    expect(Object.keys(f).sort()).toEqual(['account_id', 'id', 'name', 'role', 'total_count', 'unread_count'])
  })

  it('search_emails returns message summaries with filters', () => {
    const res = tool('search_emails').handler({ query: 'launch', unread_only: true }) as Record<string, unknown>[]
    expect(res.length).toBe(1)
    expect(Object.keys(res[0]).sort()).toEqual(['account_id', 'date', 'folder_id', 'has_attachment', 'message_id', 'sender', 'snippet', 'subject'])
  })

  it('read_email returns the full read-only shape', () => {
    const m = tool('read_email').handler({ message_id: 1 }) as Record<string, unknown>
    expect(Object.keys(m).sort()).toEqual(['account_id', 'attachments', 'body_text', 'date', 'folder_id', 'labels', 'message_id', 'recipients', 'sender', 'subject'])
  })

  it('create_draft stores a Claude-authored draft (never sends)', () => {
    const r = tool('create_draft').handler({ account_id: 1, to: 'maya@northwind.studio', subject: 'Re: Q3', body: 'Sounds good.' }) as { draft_id: number; status: string; created_at: string }
    expect(r.status).toBe('created')
    const row = db.get('SELECT created_by, subject FROM drafts WHERE id = ?', [r.draft_id]) as { created_by: string; subject: string }
    expect(row.created_by).toBe('claude')
    expect(row.subject).toBe('Re: Q3')
  })

  it('find_related_emails matches by sender/subject with a reason', () => {
    const res = tool('find_related_emails').handler({ message_id: 1 }) as Record<string, unknown>[]
    expect(res.length).toBeGreaterThanOrEqual(1)
    expect(res[0]).toHaveProperty('reason_for_match')
  })

  it('find_unanswered_emails returns received mail with no reply', () => {
    const res = tool('find_unanswered_emails').handler({}) as Record<string, unknown>[]
    expect(res.map((r) => r.message_id)).toContain(1)
  })

  it('extract_dates_and_deadlines returns dates/deadlines/tasks + confidence', () => {
    const r = tool('extract_dates_and_deadlines').handler({ message_id: 1 }) as { dates: string[]; deadlines: string[]; suggested_tasks: string[]; confidence: string }
    expect(Object.keys(r).sort()).toEqual(['confidence', 'dates', 'deadlines', 'suggested_tasks'])
    expect(r.suggested_tasks.join(' ')).toMatch(/confirm|review/i)
  })

  it('summarise_thread_data returns thread material', () => {
    const r = tool('summarise_thread_data').handler({ message_id: 1 }) as { thread_summary: string; key_points: string[]; open_questions: string[]; suggested_next_actions: string[] }
    expect(Object.keys(r).sort()).toEqual(['key_points', 'open_questions', 'suggested_next_actions', 'thread_summary'])
    expect(r.open_questions.join(' ')).toMatch(/\?/)
  })
})
