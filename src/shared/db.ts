// Shared types for DB rows and account setup / connection testing.

import type { MeetingProvider } from './meetings'

export type IncomingType = 'imap' | 'pop3'
export type Security = 'ssl' | 'starttls' | 'none'

// One incoming or outgoing server's connection details, incl. the password
// (only ever passed over IPC for a live test or a save — never persisted plain).
export interface ConnectionConfig {
  type?: IncomingType
  host: string
  port: number
  security: Security
  username: string
  password: string
}

// Everything the account setup wizard collects.
export interface AccountInput {
  displayName: string
  emailAddress: string
  incomingType: IncomingType
  incomingHost: string
  incomingPort: number
  incomingSecurity: Security
  outgoingHost: string
  outgoingPort: number
  outgoingSecurity: Security
  username: string
  password: string
}

// Result of a Test incoming / Test outgoing action. The UI maps `code` to the
// FEATURE_SPEC connection states (Incoming OK / Authentication failed / …).
export type TestCode = 'ok' | 'auth' | 'server'
export interface TestResult {
  ok: boolean
  code: TestCode
  message: string
}

export interface AccountRow {
  id: number
  display_name: string
  email_address: string
  incoming_type: string
  incoming_host: string
  incoming_port: number
  incoming_security: string
  outgoing_host: string
  outgoing_port: number
  outgoing_security: string
  username: string
  colour: string | null
  created_at: string
  updated_at: string
}

export interface AccountSummary {
  id: number
  displayName: string
  emailAddress: string
  colour: string | null
}

export interface LabelInfo {
  id: number
  name: string
  colour: string | null
}

// A local rule: one condition → one action, evaluated on incoming mail.
export type RuleField = 'from' | 'subject' | 'to' | 'body'
export type RuleOp = 'contains' | 'equals' | 'startswith'
export type RuleAction = 'move' | 'star' | 'read' | 'junk' | 'archive' | 'label'

export interface RuleInput {
  name: string
  enabled: boolean
  field: RuleField
  op: RuleOp
  value: string
  action: RuleAction
  targetFolderId: number | null
  targetLabelId: number | null
}
export interface Rule extends RuleInput {
  id: number
}

// Notifications / tray / Focus-DND settings (app_settings group).
export interface NotifySettings {
  enabled: boolean
  minimiseToTray: boolean
  dndEnabled: boolean
  dndFrom: string // "HH:MM"
  dndTo: string // "HH:MM"
  focusNow: boolean
  launchAtStartup: boolean // start DeskMail when Windows starts
  vipOnly: boolean // only notify for mail from VIP-flagged contacts
}

// A saved "smart view": a set of conditions (match all/any) over the mailbox.
export type SmartField = 'from' | 'subject' | 'to' | 'body' | 'unread' | 'starred' | 'attachment'
export type SmartOp = 'contains' | 'equals' | 'startswith'
export interface SmartCondition {
  field: SmartField
  op: SmartOp
  value: string
}
export interface SmartViewInput {
  name: string
  match: 'all' | 'any'
  conditions: SmartCondition[]
}
export interface SmartView extends SmartViewInput {
  id: number
}

export interface FolderSummary {
  id: number
  accountId: number
  name: string
  role: string | null
  unreadCount: number
  totalCount: number
  parentId: number | null // local-only nesting (custom folders); null for top-level
  sortOrder: number // manual sibling order
}

export interface AttachmentInfo {
  id: number
  filename: string | null
  mimeType: string | null
  size: number | null
}

// One row in the all-attachments browser (attachment + its message's context).
export interface AttachmentBrowserItem {
  attachmentId: number
  messageId: number
  filename: string | null
  mimeType: string | null
  size: number | null
  downloaded: boolean
  fromName: string | null
  fromEmail: string | null
  subject: string | null
  receivedAt: string | null
}

export interface MessageListItem {
  id: number
  accountId: number
  folderId: number | null
  fromName: string | null
  fromEmail: string | null
  subject: string | null
  snippet: string | null
  receivedAt: string | null
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  isPinned: boolean
  isMuted: boolean
  importance: 'high' | 'low' | 'normal' | null // from the Importance / X-Priority header
  followupAt?: string | null // "follow up by" date, if set
  isFocused: boolean // Focused/Other inbox classification (learned locally)
}

export interface MessageDetail extends MessageListItem {
  to: string[]
  cc: string[]
  bcc: string[]
  bodyText: string | null
  bodyHtml: string | null
  attachments: AttachmentInfo[]
  invite: InviteData | null
  folderRole: string | null // role of the containing folder (e.g. 'junk'), for image-blocking
  listUnsubscribe: string | null // raw List-Unsubscribe header (mailing lists)
  replyTo: string | null // Reply-To address (phishing signal when it diverges)
}

// Context the sender-signal banners need (all queried locally).
export interface SenderContext {
  priorMessagesFromSender: number
  myDomains: string[]
  frequentDomains: string[]
}

// --- Calendar & meetings -------------------------------------------------------
export interface EventAttendee {
  name: string | null
  email: string | null
  response: string | null
}

export type RecurFreq = 'none' | 'daily' | 'weekly' | 'monthly'

export interface EventInput {
  title: string
  date: string // YYYY-MM-DD
  start: string | null // HH:MM
  end: string | null
  provider: MeetingProvider
  location: string | null
  joinUrl: string | null
  notes: string | null
  calendar: string | null
  guests: string[]
  recurFreq: RecurFreq
  recurUntil: string | null // YYYY-MM-DD, inclusive; null = no end
  // Minutes before start to remind; null = no reminder. Optional so existing
  // callers that build an EventInput (MCP tool, accept-invite) still compile.
  reminderMinutes?: number | null
}

export interface EventSummary {
  id: number
  title: string
  date: string
  start: string | null
  end: string | null
  provider: MeetingProvider
  location: string | null
  joinUrl: string | null
  notes: string | null
  calendar: string | null
  attendees: EventAttendee[]
  recurFreq: RecurFreq
  recurUntil: string | null
  reminderMinutes: number | null // minutes before start; null = no reminder
}

// Parsed from an email calendar invite (ICS). Times are LOCAL wall-clock
// (converted from the sender's TZID / UTC form where the invite carried one).
export interface InviteData {
  title: string
  date: string
  start: string | null
  end: string | null
  location: string | null
  organiser: string | null
  guests: string[]
  provider: MeetingProvider
  joinUrl: string | null
  // The sender's original time (e.g. "14:00 Romance Standard Time") when it
  // differs from local, so the card can show both.
  originalTime?: string | null
  // TZID we couldn't resolve — times shown literally, flagged on the card.
  tzUnknown?: boolean
  // iTIP plumbing: the invite's UID and the organiser's address, so an
  // Accept/Decline REPLY can reference the right event and reach the sender.
  uid?: string | null
  organiserEmail?: string | null
  // Built from a join link in the body because no (parseable) .ics was found —
  // e.g. Teams/Exchange invites that arrive as TNEF. The date/time is guessed
  // from when the email arrived, so the card tells the user to check it.
  fallback?: boolean
}

// --- Stage 8 added features ----------------------------------------------------
export interface SignatureData {
  id: number
  body: string
  appendToNew: boolean
}

// One of an account's (possibly several) signatures, selectable at compose time.
export interface SignatureItem {
  id: number
  name: string
  body: string // HTML (may be simple bold/links)
  isDefault: boolean
  appendToNew: boolean
}

export interface ScheduledSend {
  id: number
  draftId: number | null
  accountId: number | null
  sendAt: string
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  subject: string | null
  to: string[]
}

export type SnoozeOption = 'later' | 'tomorrow' | 'weekend' | 'nextweek'

export interface Template {
  id: number
  name: string
  subject: string | null
  body: string | null
}

export interface Contact {
  id: number
  name: string | null
  email: string | null
  vip: boolean
}

// Full contact record for the address book (manual add/edit + groups).
export interface ContactInput {
  name: string | null
  email: string | null
  org: string | null
  notes: string | null
  groups: string[]
  vip?: boolean // VIP flag; defaults to false when omitted (older callers / vCard import)
}
export interface ContactDetail extends ContactInput {
  id: number
}

// A lightweight task (Today is its only surface).
export interface TaskItem {
  id: number
  title: string
  dueAt: string | null // YYYY-MM-DD
  done: boolean
  messageId: number | null // "made from this email" link
  createdAt: string
}

// One sent message still waiting on a reply (no-reply nudge).
export interface AwaitingReply {
  id: number
  accountId: number
  subject: string | null
  to: string[]
  sentAt: string | null
}

export interface TodayAgenda {
  events: EventSummary[]
  messages: MessageListItem[]
  tasks: TaskItem[]
  awaitingReply: AwaitingReply[]
}

// Mail actions (applied locally + pushed to IMAP). 'trash' = move to Trash
// (reversible). 'delete-forever' = permanent delete: removes the local row and
// expunges the server copy (used only from Trash/Junk, behind a confirm).
export type MailOp = 'move' | 'flag' | 'unflag' | 'read' | 'unread' | 'trash' | 'junk' | 'archive' | 'delete-forever'

export interface ComposeAttachment {
  path: string
  name: string
  size: number
}

// Compose payload used for saving a draft and for sending.
export interface ComposePayload {
  draftId?: number | null
  accountId: number
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
  attachments?: ComposeAttachment[]
  inReplyToMessageId?: number | null
  // Which signature to append (null/undefined → the account default when set to append).
  signatureId?: number | null
  // Outgoing priority; sets the Importance / X-Priority header when not 'normal'.
  importance?: 'high' | 'normal' | 'low'
  // Calendar invite payload (nodemailer renders it as a text/calendar part).
  icalEvent?: { method: string; content: string }
}

export interface DraftSummary {
  id: number
  accountId: number | null
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string | null
  bodyHtml: string | null
  attachments: ComposeAttachment[]
  createdBy: string
  updatedAt: string
}

export type SendResult = { ok: true } | { ok: false; error: string }

// What the sync/ingest layer inserts for one parsed message.
export interface MessageInsert {
  accountId: number
  folderId: number | null
  remoteUid: number | null
  messageIdHeader: string | null
  fromName: string | null
  fromEmail: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string | null
  snippet: string | null
  bodyText: string | null
  bodyHtml: string | null
  receivedAt: string | null
  sentAt: string | null
  isRead: boolean
  isStarred: boolean
  importance?: 'high' | 'low' | 'normal' | null
  listUnsubscribe?: string | null // raw List-Unsubscribe header, if present
  replyTo?: string | null // Reply-To address when it differs from From
  references?: string[] // In-Reply-To + References message-ids
}
