import { z, type ZodRawShape } from 'zod'
import type { DB } from '../db/database'
import { listAccounts } from '../db/accounts'
import { listFolders } from '../db/folders'
import { getMessage, searchEmails, setFollowup } from '../db/messages'
import { saveDraft } from '../db/drafts'
import { applyAction } from '../db/mailActions'
import { listLabels, setMessageLabel } from '../db/labels'
import { createEvent } from '../db/events'
import { suggestRules } from '../db/rules'
import { computeSnoozeTime, snoozeMessage } from '../db/snoozes'
import { getDigestData } from '../db/today'
import type { MailOp, SnoozeOption } from '@shared/db'
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
      description: 'Export an email (and its already-downloaded attachments) to a folder as source files, so they can be added to a NotebookLM notebook. Pass the target notebook name to hand the notebooklm skill both the path and the notebook in one step. Returns the folder, file paths and the notebook.',
      inputSchema: { message_id: z.number(), include_attachments: z.boolean().optional(), notebook: z.string().optional() },
      handler: (a) => ({ ...exportForNotebookLM(db, a.message_id as number, exportDir, (a.include_attachments as boolean) ?? true), notebook: (a.notebook as string) ?? null })
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
    },
    {
      name: 'list_labels',
      description: 'List the colour labels (categories) available to apply to messages.',
      inputSchema: {},
      handler: () => listLabels(db).map((l) => ({ id: l.id, name: l.name, colour: l.colour }))
    },
    {
      name: 'label_email',
      description: 'Apply or remove a label (category) on a message, by label id. Reversible.',
      inputSchema: { message_id: z.number(), label_id: z.number(), on: z.boolean() },
      handler: (a) => {
        setMessageLabel(db, a.message_id as number, a.label_id as number, a.on as boolean)
        return { ok: true }
      }
    },
    {
      name: 'inbox_overview',
      description: 'One call: unread/total counts per account and folder, plus a grand-total unread — answers "how many unread do I have?" without stitching searches.',
      inputSchema: {},
      handler: () => {
        const accounts = listAccounts(db)
        const counts = db.all(
          `SELECT f.id, f.account_id, f.name, f.role,
             (SELECT COUNT(*) FROM messages m WHERE m.folder_id = f.id AND m.is_read = 0 AND m.is_muted = 0) AS unread,
             (SELECT COUNT(*) FROM messages m WHERE m.folder_id = f.id) AS total
           FROM folders f`
        ) as unknown as { id: number; account_id: number; name: string; role: string | null; unread: number; total: number }[]
        const byAccount = accounts.map((acc) => {
          const fs = counts.filter((f) => f.account_id === acc.id)
          return {
            account_id: acc.id,
            email: acc.emailAddress,
            unread: fs.reduce((s, f) => s + f.unread, 0),
            total: fs.reduce((s, f) => s + f.total, 0),
            folders: fs.map((f) => ({ name: f.name, role: f.role, unread: f.unread, total: f.total }))
          }
        })
        return { total_unread: byAccount.reduce((s, a) => s + a.unread, 0), accounts: byAccount }
      }
    },
    {
      name: 'triage_priority',
      description: 'Rank unanswered received mail by a simple priority heuristic (importance flag, questions asked, addressed directly to you, recency) so you can tackle the most important first.',
      inputSchema: { limit: z.number().optional() },
      handler: (a) => {
        const limit = Math.min(Math.max((a.limit as number) ?? 15, 1), 100)
        const rows = db.all(
          `SELECT m.id, m.subject, m.from_name, m.from_email, m.snippet, m.body_text, m.received_at, m.importance, m.to_json, acc.email_address AS self
           FROM messages m JOIN accounts acc ON acc.id = m.account_id
           WHERE m.from_email IS NOT NULL AND m.from_email != acc.email_address AND m.is_read = 0 AND m.is_muted = 0
             AND m.id NOT IN (SELECT in_reply_to_message_id FROM drafts WHERE in_reply_to_message_id IS NOT NULL)
           ORDER BY m.received_at DESC LIMIT 200`
        ) as unknown as { id: number; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null; body_text: string | null; received_at: string | null; importance: string | null; to_json: string | null; self: string }[]
        const now = Date.now()
        return rows
          .map((r) => {
            let score = 0
            if (r.importance === 'high') score += 3
            if ((r.body_text ?? '').includes('?')) score += 2
            let to: string[] = []
            try { to = JSON.parse(r.to_json ?? '[]') } catch { to = [] }
            if (to.some((t) => t.toLowerCase() === r.self.toLowerCase())) score += 2 // direct to me, not bulk
            const ageDays = r.received_at ? (now - Date.parse(r.received_at)) / 86_400_000 : 999
            if (ageDays < 2) score += 1
            return { message_id: r.id, sender: r.from_name || r.from_email, subject: r.subject, date: r.received_at, snippet: r.snippet, priority_score: score }
          })
          .sort((x, y) => y.priority_score - x.priority_score)
          .slice(0, limit)
      }
    },
    {
      name: 'batch_apply',
      description: 'Apply a reviewed batch of organise actions at once. Each item: {message_id, action: move|archive|trash|flag|unflag|read|unread|label, target_folder_id?, label_id?}. Reversible actions only — never sends or permanently deletes.',
      inputSchema: { actions: z.array(z.object({ message_id: z.number(), action: z.string(), target_folder_id: z.number().optional(), label_id: z.number().optional() })) },
      handler: (a) => {
        const actions = a.actions as { message_id: number; action: string; target_folder_id?: number; label_id?: number }[]
        let applied = 0
        for (const act of actions) {
          if (act.action === 'label' && act.label_id != null) { setMessageLabel(db, act.message_id, act.label_id, true); applied++; continue }
          if (['move', 'archive', 'trash', 'flag', 'unflag', 'read', 'unread'].includes(act.action)) {
            if (applyAction(db, act.message_id, act.action as MailOp, act.target_folder_id)) applied++
          }
        }
        return { applied, requested: actions.length }
      }
    },
    {
      name: 'suggest_rules',
      description: 'Analyse recent mail for recurring senders and suggest filter rules (sender → move). Returns suggestions only; the user accepts them in Settings → Rules.',
      inputSchema: { min_count: z.number().optional() },
      handler: (a) => {
        const min = Math.max((a.min_count as number) ?? 4, 2)
        const rows = db.all(
          `SELECT from_email, MAX(from_name) AS from_name, COUNT(*) AS c FROM messages
           WHERE from_email IS NOT NULL GROUP BY from_email HAVING c >= ? ORDER BY c DESC LIMIT 25`,
          [min]
        ) as unknown as { from_email: string; from_name: string | null; c: number }[]
        return rows.map((r) => ({ sender: r.from_email, name: r.from_name, message_count: r.c, suggested_rule: { field: 'from', op: 'contains', value: r.from_email, action: 'move' } }))
      }
    },
    {
      name: 'get_unsubscribe_info',
      description: "Return a message's unsubscribe options from its List-Unsubscribe header (http link and/or mailto). Does NOT unsubscribe — surfaces the choice so the user can confirm.",
      inputSchema: { message_id: z.number() },
      handler: (a) => {
        const r = db.get('SELECT list_unsubscribe FROM messages WHERE id = ?', [a.message_id as number]) as { list_unsubscribe: string | null } | undefined
        const raw = r?.list_unsubscribe ?? null
        if (!raw) return { available: false }
        const http = raw.match(/<(https?:[^>]+)>/i)?.[1] ?? null
        const mailto = raw.match(/<mailto:([^>]+)>/i)?.[1] ?? null
        return { available: Boolean(http || mailto), http_url: http, mailto, raw }
      }
    },
    {
      name: 'get_sent_context',
      description: 'What has the user already sent? Search sent mail by recipient and/or free text — answers "which of these still need a reply from me?" without guesswork. Read-only.',
      inputSchema: { recipient: z.string().optional(), query: z.string().optional(), limit: z.number().optional() },
      handler: (a) => {
        const limit = Math.min(Math.max((a.limit as number) ?? 10, 1), 50)
        const where: string[] = ["f.role = 'sent'"]
        const params: (string | number)[] = []
        if (a.recipient) {
          where.push('LOWER(m.to_json) LIKE ?')
          params.push(`%${String(a.recipient).toLowerCase()}%`)
        }
        for (const t of String(a.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)) {
          where.push('(LOWER(m.subject) LIKE ? OR LOWER(m.snippet) LIKE ? OR LOWER(m.body_text) LIKE ?)')
          params.push(`%${t}%`, `%${t}%`, `%${t}%`)
        }
        const rows = db.all(
          `SELECT m.id, m.subject, m.to_json, m.sent_at, m.snippet
             FROM messages m JOIN folders f ON f.id = m.folder_id
            WHERE ${where.join(' AND ')} ORDER BY m.sent_at DESC LIMIT ?`,
          [...params, limit]
        ) as unknown as { id: number; subject: string | null; to_json: string | null; sent_at: string | null; snippet: string | null }[]
        return rows.map((r) => {
          let to: string[] = []
          try { to = JSON.parse(r.to_json ?? '[]') } catch { to = [] }
          return { message_id: r.id, subject: r.subject, to, sent_at: r.sent_at, snippet: r.snippet }
        })
      }
    },
    {
      name: 'snooze_email',
      description: "Snooze a message until a time — it hides from the inbox and returns when due. Reversible (the user can unsnooze in DeskMail). until: an ISO date-time, or 'later' | 'tomorrow' | 'weekend' | 'nextweek'.",
      inputSchema: { message_id: z.number(), until: z.string() },
      handler: (a) => {
        const id = a.message_id as number
        if (!getMessage(db, id)) return { ok: false, error: 'No such message.' }
        const until = String(a.until)
        const quick = ['later', 'tomorrow', 'weekend', 'nextweek']
        if (!quick.includes(until) && Number.isNaN(Date.parse(until))) {
          return { ok: false, error: 'until must be an ISO date-time or a quick option.' }
        }
        const iso = quick.includes(until) ? computeSnoozeTime(until as SnoozeOption) : new Date(until).toISOString()
        snoozeMessage(db, id, iso)
        return { ok: true, snoozed_until: iso }
      }
    },
    {
      name: 'set_followup',
      description: 'Set (or clear with null) a "follow up by" date on a message. Follow-ups surface in the Today view when due. Reversible.',
      inputSchema: { message_id: z.number(), due: z.string().nullable() },
      handler: (a) => {
        const id = a.message_id as number
        if (!getMessage(db, id)) return { ok: false, error: 'No such message.' }
        const due = a.due as string | null
        if (due != null && Number.isNaN(Date.parse(due))) return { ok: false, error: 'due must be an ISO date or null.' }
        setFollowup(db, id, due)
        return { ok: true, followup_at: due }
      }
    },
    {
      name: 'get_daily_digest',
      description: "One call for \"what's my morning look like?\": today's events, unread highlights, tasks, follow-ups due, snoozes landing today and sent mail still waiting on a reply. Read-only — the digest writing is yours.",
      inputSchema: {},
      handler: () => {
        const now = new Date()
        const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const d = getDigestData(db, iso)
        return {
          date: iso,
          events: d.events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, provider: e.provider })),
          unread: d.unread.map((m) => ({ message_id: m.id, sender: m.fromName || m.fromEmail, subject: m.subject, snippet: m.snippet, importance: m.importance, focused: m.isFocused })),
          tasks: d.tasks.map((t) => ({ id: t.id, title: t.title, due_at: t.dueAt, done: t.done })),
          followups_due_today: d.followupsDueToday.map((f) => ({ message_id: f.id, subject: f.subject, sender: f.fromName || f.fromEmail })),
          snoozes_landing_today: d.snoozesLandingToday.map((s) => ({ message_id: s.id, subject: s.subject, sender: s.fromName || s.fromEmail, due: s.snoozeUntil })),
          awaiting_reply: d.awaitingReply.map((n) => ({ message_id: n.id, subject: n.subject, to: n.to, sent_at: n.sentAt }))
        }
      }
    },
    {
      name: 'get_rule_suggestions',
      description: 'Mine the user\'s own actions for rule-worthy patterns ("you\'ve junked 12 from this sender"). Returns ready-to-create rule params; creating a rule is a separate, explicit step the user confirms.',
      inputSchema: { min_count: z.number().optional() },
      handler: (a) =>
        suggestRules(db, Math.max((a.min_count as number) ?? 5, 2)).map((s) => ({
          field: s.field,
          op: s.op,
          value: s.value,
          action: s.action,
          target_folder_id: s.targetFolderId,
          evidence_count: s.count,
          last_at: s.lastAt
        }))
    },
    {
      name: 'create_calendar_event',
      description: 'Create a local calendar event (e.g. turned from an email). The user sees it in DeskMail; nothing is sent. Returns the new event id.',
      inputSchema: { title: z.string(), date: z.string(), start: z.string().optional(), end: z.string().optional(), notes: z.string().optional() },
      handler: (a) => ({
        event_id: createEvent(db, {
          title: a.title as string,
          date: a.date as string,
          start: (a.start as string) ?? null,
          end: (a.end as string) ?? null,
          provider: 'inperson',
          location: null,
          joinUrl: null,
          notes: (a.notes as string) ?? null,
          calendar: null,
          guests: [],
          recurFreq: 'none',
          recurUntil: null
        })
      })
    }
  ]
}
