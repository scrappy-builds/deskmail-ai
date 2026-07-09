// Shared types for DB rows and account setup / connection testing.

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
}

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
