import { z, type ZodRawShape } from 'zod'
import type { DB } from '../db/database'
import { listAccounts } from '../db/accounts'
import { listFolders } from '../db/folders'
import { getMessage, searchEmails } from '../db/messages'
import { saveDraft } from '../db/drafts'
import { applyAction } from '../db/mailActions'
import { exportForNotebookLM } from './export'

// A tool definition kept independent of the MCP SDK so it's directly testable.
export interface ToolDef {
  name: string
  description: string
  inputSchema: ZodRawShape
  handler: (args: Record<string, unknown>) => unknown
}

function sentences(text: string | null): string[] {
  if (!text) return []
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const DATE_RE =
  /\b(\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{2,4})?|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi
const DEADLINE_RE = /\b(deadline|due|by\s|before|no later than|end of (?:day|week|month)|eod|eow)\b/i
const TASK_RE = /\b(please|can you|could you|need to|let me know|action|to do|follow up|confirm|send|review|approve)\b/i

// The safe tool surface. It can read, draft, and organise mail (move/flag/read/
// trash — all reversible), and export a message for NotebookLM. It NEVER sends,
// permanently deletes, reads credentials, changes account settings, or writes
// outside the app's own storage.
export function buildTools(db: DB, opts?: { exportDir?: string }): ToolDef[] {
  const exportDir = opts?.exportDir ?? '.'
  return [
    {
      name: 'list_accounts',
      description: 'List the mail accounts configured in DeskMail (no credentials).',
      inputSchema: {},
      handler: () => {
        const accounts = listAccounts(db)
        return accounts.map((a) => {
          const st = db.get(
            "SELECT sync_status FROM sync_state WHERE account_id = ? ORDER BY id DESC LIMIT 1",
            [a.id]
          ) as { sync_status: string | null } | undefined
          return {
            id: a.id,
            display_name: a.displayName,
            email_address: a.emailAddress,
            colour: a.colour,
            status: st?.sync_status ?? 'ok'
          }
        })
      }
    },
    {
      name: 'list_folders',
      description: 'List folders, optionally for one account, with unread/total counts.',
      inputSchema: { account_id: z.number().optional() },
      handler: (args) =>
        listFolders(db, args.account_id as number | undefined).map((f) => ({
          id: f.id,
          account_id: f.accountId,
          name: f.name,
          role: f.role,
          unread_count: f.unreadCount,
          total_count: f.totalCount
        }))
    },
    {
      name: 'search_emails',
      description: 'Search cached emails with optional filters. Read-only.',
      inputSchema: {
        query: z.string().optional(),
        account_id: z.number().optional(),
        folder_id: z.number().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        unread_only: z.boolean().optional(),
        has_attachments: z.boolean().optional(),
        limit: z.number().optional()
      },
      handler: (a) =>
        searchEmails(db, {
          query: a.query as string | undefined,
          accountId: a.account_id as number | undefined,
          folderId: a.folder_id as number | undefined,
          dateFrom: a.date_from as string | undefined,
          dateTo: a.date_to as string | undefined,
          unreadOnly: a.unread_only as boolean | undefined,
          hasAttachments: a.has_attachments as boolean | undefined,
          limit: a.limit as number | undefined
        }).map((m) => ({
          message_id: m.id,
          sender: m.fromName || m.fromEmail,
          subject: m.subject,
          date: m.receivedAt,
          snippet: m.snippet,
          account_id: m.accountId,
          folder_id: m.folderId,
          has_attachment: m.hasAttachments
        }))
    },
    {
      name: 'read_email',
      description: 'Read one email by id: sender, recipients, subject, date, plain text body, attachments.',
      inputSchema: { message_id: z.number() },
      handler: (a) => {
        const m = getMessage(db, a.message_id as number)
        if (!m) return null
        return {
          message_id: m.id,
          sender: m.fromName || m.fromEmail,
          recipients: m.to,
          subject: m.subject,
          date: m.receivedAt,
          body_text: m.bodyText,
          attachments: m.attachments.map((at) => ({ filename: at.filename, mime_type: at.mimeType, size: at.size })),
          labels: [],
          account_id: m.accountId,
          folder_id: m.folderId
        }
      }
    },
    {
      name: 'create_draft',
      description: 'Create a draft reply, visible to the user in DeskMail. Never sends — the user reviews and sends manually.',
      inputSchema: {
        account_id: z.number(),
        to: z.union([z.string(), z.array(z.string())]),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        bcc: z.union([z.string(), z.array(z.string())]).optional(),
        subject: z.string(),
        body: z.string(),
        in_reply_to_message_id: z.number().optional()
      },
      handler: (a) => {
        const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [])
        const draftId = saveDraft(
          db,
          {
            accountId: a.account_id as number,
            to: arr(a.to),
            cc: arr(a.cc),
            bcc: arr(a.bcc),
            subject: a.subject as string,
            bodyHtml: `<p>${String(a.body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
            inReplyToMessageId: (a.in_reply_to_message_id as number | undefined) ?? null
          },
          'claude'
        )
        return { draft_id: draftId, status: 'created', created_at: new Date().toISOString() }
      }
    },
    {
      name: 'find_related_emails',
      description: 'Find emails related to a given one (same sender or similar subject).',
      inputSchema: { message_id: z.number(), limit: z.number().optional() },
      handler: (a) => {
        const m = getMessage(db, a.message_id as number)
        if (!m) return []
        const limit = Math.min(Math.max((a.limit as number) ?? 10, 1), 50)
        const subjectKey = (m.subject ?? '').replace(/^(re|fwd?):\s*/gi, '').trim()
        const rows = db.all(
          `SELECT id, subject, from_name, from_email, snippet, received_at,
             CASE WHEN from_email = ? THEN 'Same sender' ELSE 'Similar subject' END AS reason
           FROM messages
           WHERE id != ? AND (from_email = ? OR (subject IS NOT NULL AND subject LIKE ?))
           ORDER BY received_at DESC LIMIT ?`,
          [m.fromEmail, m.id, m.fromEmail, `%${subjectKey}%`, limit]
        ) as unknown as { id: number; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null; received_at: string | null; reason: string }[]
        return rows.map((r) => ({
          message_id: r.id,
          subject: r.subject,
          sender: r.from_name || r.from_email,
          date: r.received_at,
          snippet: r.snippet,
          reason_for_match: r.reason
        }))
      }
    },
    {
      name: 'find_unanswered_emails',
      description: 'Find received emails that have no reply drafted or sent yet.',
      inputSchema: { account_id: z.number().optional(), limit: z.number().optional() },
      handler: (a) => {
        const limit = Math.min(Math.max((a.limit as number) ?? 20, 1), 100)
        const accountId = a.account_id as number | undefined
        const rows = db.all(
          `SELECT m.id, m.subject, m.from_name, m.from_email, m.snippet, m.received_at
           FROM messages m
           JOIN accounts acc ON acc.id = m.account_id
           WHERE m.from_email IS NOT NULL
             AND m.from_email != acc.email_address
             ${accountId != null ? 'AND m.account_id = ?' : ''}
             AND m.id NOT IN (SELECT in_reply_to_message_id FROM drafts WHERE in_reply_to_message_id IS NOT NULL)
           ORDER BY m.received_at DESC LIMIT ?`,
          accountId != null ? [accountId, limit] : [limit]
        ) as unknown as { id: number; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null; received_at: string | null }[]
        return rows.map((r) => ({
          message_id: r.id,
          subject: r.subject,
          sender: r.from_name || r.from_email,
          date: r.received_at,
          snippet: r.snippet
        }))
      }
    },
    {
      name: 'extract_dates_and_deadlines',
      description: 'Extract candidate dates, deadlines and tasks from an email body for Claude to reason over.',
      inputSchema: { message_id: z.number() },
      handler: (a) => {
        const m = getMessage(db, a.message_id as number)
        if (!m) return { dates: [], deadlines: [], suggested_tasks: [], confidence: 'low' }
        const text = m.bodyText ?? ''
        const dates = Array.from(new Set((text.match(DATE_RE) ?? []).map((s) => s.trim())))
        const sents = sentences(text)
        const deadlines = sents.filter((s) => DEADLINE_RE.test(s) && DATE_RE.test(s))
        const suggested_tasks = sents.filter((s) => TASK_RE.test(s)).slice(0, 8)
        const found = dates.length + deadlines.length
        return {
          dates,
          deadlines,
          suggested_tasks,
          confidence: found >= 3 ? 'high' : found >= 1 ? 'medium' : 'low'
        }
      }
    },
    {
      name: 'move_email',
      description: 'Move an email to another folder (by folder id). Applied locally and pushed to the server.',
      inputSchema: { message_id: z.number(), target_folder_id: z.number() },
      handler: (a) => ({ ok: applyAction(db, a.message_id as number, 'move', a.target_folder_id as number), op: 'move' })
    },
    {
      name: 'archive_email',
      description: 'Move an email to the Archive folder.',
      inputSchema: { message_id: z.number() },
      handler: (a) => ({ ok: applyAction(db, a.message_id as number, 'archive'), op: 'archive' })
    },
    {
      name: 'delete_email',
      description: 'Move an email to Trash (reversible). This never permanently deletes anything.',
      inputSchema: { message_id: z.number() },
      handler: (a) => ({ ok: applyAction(db, a.message_id as number, 'trash'), op: 'trash' })
    },
    {
      name: 'flag_email',
      description: 'Flag (star) or unflag an email.',
      inputSchema: { message_id: z.number(), flagged: z.boolean() },
      handler: (a) => ({ ok: applyAction(db, a.message_id as number, (a.flagged as boolean) ? 'flag' : 'unflag'), op: 'flag' })
    },
    {
      name: 'mark_email_read',
      description: 'Mark an email read or unread.',
      inputSchema: { message_id: z.number(), read: z.boolean() },
      handler: (a) => ({ ok: applyAction(db, a.message_id as number, (a.read as boolean) ? 'read' : 'unread'), op: 'read' })
    },
    {
      name: 'export_for_notebooklm',
      description: 'Export an email (and its already-downloaded attachments) to a folder as source files, so they can be added to a NotebookLM notebook. Returns the folder and file paths.',
      inputSchema: { message_id: z.number(), include_attachments: z.boolean().optional() },
      handler: (a) => exportForNotebookLM(db, a.message_id as number, exportDir, (a.include_attachments as boolean) ?? true)
    },
    {
      name: 'summarise_thread_data',
      description: 'Return structured thread data (messages, key points, open questions) for Claude to summarise.',
      inputSchema: { message_id: z.number() },
      handler: (a) => {
        const m = getMessage(db, a.message_id as number)
        if (!m) return { thread_summary: '', key_points: [], open_questions: [], suggested_next_actions: [] }
        const subjectKey = (m.subject ?? '').replace(/^(re|fwd?):\s*/gi, '').trim()
        const thread = db.all(
          "SELECT from_name, from_email, body_text, received_at FROM messages WHERE subject LIKE ? ORDER BY received_at",
          [`%${subjectKey}%`]
        ) as unknown as { from_name: string | null; from_email: string | null; body_text: string | null; received_at: string | null }[]

        const key_points: string[] = []
        const open_questions: string[] = []
        const suggested_next_actions: string[] = []
        for (const msg of thread) {
          const s = sentences(msg.body_text)
          if (s[0]) key_points.push(`${msg.from_name || msg.from_email}: ${s[0]}`)
          for (const line of s) {
            if (line.endsWith('?')) open_questions.push(line)
            else if (TASK_RE.test(line)) suggested_next_actions.push(line)
          }
        }
        return {
          thread_summary: key_points.join(' '),
          key_points,
          open_questions: open_questions.slice(0, 10),
          suggested_next_actions: suggested_next_actions.slice(0, 10)
        }
      }
    }
  ]
}
