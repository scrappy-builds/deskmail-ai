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
