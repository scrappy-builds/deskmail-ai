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

export interface FolderSummary {
  id: number
  accountId: number
  name: string
  role: string | null
  unreadCount: number
  totalCount: number
}

export interface AttachmentInfo {
  id: number
  filename: string | null
  mimeType: string | null
  size: number | null
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
}

export interface MessageDetail extends MessageListItem {
  to: string[]
  cc: string[]
  bcc: string[]
  bodyText: string | null
  bodyHtml: string | null
  attachments: AttachmentInfo[]
  invite: InviteData | null
}

// --- Calendar & meetings -------------------------------------------------------
export interface EventAttendee {
  name: string | null
  email: string | null
  response: string | null
}

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
}

// Parsed from an email calendar invite (ICS).
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
}

// --- Stage 8 added features ----------------------------------------------------
export interface SignatureData {
  id: number
  body: string
  appendToNew: boolean
}

export interface ScheduledSend {
  id: number
  draftId: number | null
  accountId: number | null
  sendAt: string
  status: string
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
}

export interface TodayAgenda {
  events: EventSummary[]
  messages: MessageListItem[]
}

// Mail actions (applied locally + pushed to IMAP). 'trash' = move to Trash
// (reversible); there is no permanent-delete action.
export type MailOp = 'move' | 'flag' | 'unflag' | 'read' | 'unread' | 'trash' | 'junk' | 'archive'

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
}

export interface DraftSummary {
  id: number
  accountId: number | null
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string | null
  bodyHtml: string | null
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
}
