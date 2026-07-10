import { simpleParser, type AddressObject } from 'mailparser'
import type { MessageInsert } from '@shared/db'
import { addAttachment, upsertMessage } from '../../db/messages'
import { upsertContact } from '../../db/contacts'
import { parseIcs } from './ics'
import type { DB } from '../../db/database'

export interface IngestMeta {
  accountId: number
  folderId: number | null
  remoteUid: number | null
  isRead: boolean
  isStarred: boolean
}

function addresses(a?: AddressObject | AddressObject[]): string[] {
  if (!a) return []
  const arr = Array.isArray(a) ? a : [a]
  return arr.flatMap((x) => x.value.map((v) => v.address ?? '').filter(Boolean))
}

function makeSnippet(text?: string, html?: string): string {
  const base = text ?? (html ? html.replace(/<[^>]+>/g, ' ') : '')
  return base.replace(/\s+/g, ' ').trim().slice(0, 160)
}

// Parse one raw RFC822 message and store it (with attachment metadata).
// Returns the stored message id. Pure over the DB, so it's unit-testable
// without any network — this is the "offline cache" write path.
export async function ingestRaw(db: DB, meta: IngestMeta, raw: Buffer | string): Promise<number> {
  const parsed = await simpleParser(raw)
  const from = parsed.from?.value?.[0]

  const insert: MessageInsert = {
    accountId: meta.accountId,
    folderId: meta.folderId,
    remoteUid: meta.remoteUid,
    messageIdHeader: parsed.messageId ?? null,
    fromName: from?.name || null,
    fromEmail: from?.address || null,
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    bcc: addresses(parsed.bcc),
    subject: parsed.subject ?? null,
    snippet: makeSnippet(parsed.text, typeof parsed.html === 'string' ? parsed.html : undefined),
    bodyText: parsed.text ?? null,
    bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
    receivedAt: parsed.date?.toISOString() ?? null,
    sentAt: parsed.date?.toISOString() ?? null,
    isRead: meta.isRead,
    isStarred: meta.isStarred,
    // mailparser derives priority from the Importance / X-Priority headers.
    importance: parsed.priority ?? null,
    listUnsubscribe: parsed.headers.get('list-unsubscribe') ? String(parsed.headers.get('list-unsubscribe')) : null
  }

  const attachments = parsed.attachments ?? []

  // Detect a calendar invite (a text/calendar part or an .ics attachment).
  let inviteJson: string | null = null
  const cal = attachments.find(
    (a) => (a.contentType ?? '').toLowerCase().includes('calendar') || (a.filename ?? '').toLowerCase().endsWith('.ics')
  )
  if (cal?.content) {
    const invite = parseIcs(cal.content.toString('utf-8'))
    if (invite) inviteJson = JSON.stringify(invite)
  }

  const id = upsertMessage(db, insert, attachments.length > 0, inviteJson)

  // Auto-collect the sender into the address book for autocomplete.
  if (from?.address) upsertContact(db, from.name || null, from.address)

  for (const att of attachments) {
    // ponytail: store metadata only; attachment content is fetched to disk when
    // the user chooses to open it (attachments never auto-open, per the spec).
    addAttachment(db, id, att.filename ?? null, att.contentType ?? null, att.size ?? null, null)
  }
  return id
}
