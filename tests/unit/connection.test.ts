import { describe, expect, it } from 'vitest'
import { classifyImapError, classifySmtpError } from '../../src/main/mail/connectionTest'

describe('connection error classification → FEATURE_SPEC states', () => {
  it('IMAP authentication failures map to "auth"', () => {
    expect(classifyImapError({ authenticationFailed: true }).code).toBe('auth')
    expect(classifyImapError({ responseText: 'Invalid credentials' }).code).toBe('auth')
    expect(classifyImapError({ message: 'LOGIN failed' }).code).toBe('auth')
  })

  it('IMAP connection/host failures map to "server"', () => {
    expect(classifyImapError({ message: 'connect ECONNREFUSED 127.0.0.1:993' }).code).toBe('server')
    expect(classifyImapError({ message: 'getaddrinfo ENOTFOUND imap.nope' }).code).toBe('server')
  })

  it('SMTP auth failures (EAUTH / 535 / 534) map to "auth"', () => {
    expect(classifySmtpError({ code: 'EAUTH' }).code).toBe('auth')
    expect(classifySmtpError({ responseCode: 535 }).code).toBe('auth')
    expect(classifySmtpError({ responseCode: 534 }).code).toBe('auth')
  })

  it('SMTP connection failures map to "server"', () => {
    expect(classifySmtpError({ code: 'ECONNECTION' }).code).toBe('server')
    expect(classifySmtpError({ code: 'ETIMEDOUT' }).code).toBe('server')
  })
})
