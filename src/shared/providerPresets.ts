// Known mail-provider connection settings, plus a best-guess for unknown domains.
// Used by the account wizard (autofill) and the MCP connector (so Claude Desktop
// can set an account up for the user without asking for host/port trivia).
//
// DeskMail authenticates with a plain username + password over IMAP/SMTP — it has
// no OAuth. Several big providers now require an *app-specific* password (and 2FA)
// for that, or block password login entirely; the `note` on each preset says so,
// because that is exactly the guidance a non-technical user needs up front.

import type { Security } from './db'

export interface MailSettings {
  imapHost: string
  imapPort: number
  imapSecurity: Security
  smtpHost: string
  smtpPort: number
  smtpSecurity: Security
}

export interface ProviderPreset extends MailSettings {
  provider: string // human-readable provider name
  note?: string // guidance shown to the user (app password, caveats)
  // true when these came from a known provider; false when they are a guess from
  // the domain that the user should confirm with their provider/host.
  confirmed: boolean
}

// The typical ports, for guessing and for explaining choices to the user.
export const COMMON_PORTS = {
  imapSsl: 993,
  imapStarttls: 143,
  smtpSsl: 465,
  smtpStarttls: 587,
  pop3Ssl: 995
} as const

const APP_PW = (name: string): string =>
  `${name} requires an app-specific password (not your normal login password) and two-factor authentication switched on. Create one in your ${name} account's security settings, then enter it as the password.`

// Domain → preset. Aliases (hotmail/live/googlemail…) map to the same entry.
const PRESETS: Record<string, ProviderPreset> = {
  'outlook.com': {
    provider: 'Outlook / Microsoft',
    imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'starttls',
    confirmed: true,
    note: 'Microsoft is retiring password (basic-auth) login for personal Outlook/Hotmail accounts in favour of sign-in that DeskMail does not support. If the connection test fails on authentication, this account may no longer accept app passwords — check Microsoft’s current guidance.'
  },
  'icloud.com': {
    provider: 'iCloud Mail',
    imapHost: 'imap.mail.me.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.mail.me.com', smtpPort: 587, smtpSecurity: 'starttls',
    confirmed: true,
    note: APP_PW('iCloud')
  },
  'gmail.com': {
    provider: 'Gmail',
    imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: APP_PW('Gmail')
  },
  'yahoo.com': {
    provider: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: APP_PW('Yahoo')
  },
  'aol.com': {
    provider: 'AOL Mail',
    imapHost: 'imap.aol.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.aol.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: APP_PW('AOL')
  },
  'fastmail.com': {
    provider: 'Fastmail',
    imapHost: 'imap.fastmail.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.fastmail.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: APP_PW('Fastmail')
  },
  'gmx.com': {
    provider: 'GMX',
    imapHost: 'imap.gmx.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'mail.gmx.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: 'GMX requires IMAP/POP access to be switched on in the GMX web settings first.'
  },
  'zoho.com': {
    provider: 'Zoho Mail',
    imapHost: 'imap.zoho.com', imapPort: 993, imapSecurity: 'ssl',
    smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecurity: 'ssl',
    confirmed: true,
    note: 'Zoho requires IMAP access to be enabled in the Zoho Mail settings; an app-specific password is recommended if you use two-factor authentication.'
  },
  'proton.me': {
    provider: 'Proton Mail',
    imapHost: '127.0.0.1', imapPort: 1143, imapSecurity: 'starttls',
    smtpHost: '127.0.0.1', smtpPort: 1025, smtpSecurity: 'starttls',
    confirmed: false,
    note: 'Proton Mail only allows IMAP/SMTP through Proton Mail Bridge running on your PC. Install Bridge, then use the host, port and password it shows you (the values here are Bridge’s usual local defaults).'
  }
}

// Domain aliases that share a preset entry.
const ALIASES: Record<string, string> = {
  'hotmail.com': 'outlook.com', 'hotmail.co.uk': 'outlook.com', 'live.com': 'outlook.com',
  'live.co.uk': 'outlook.com', 'msn.com': 'outlook.com', 'outlook.co.uk': 'outlook.com',
  'me.com': 'icloud.com', 'mac.com': 'icloud.com',
  'googlemail.com': 'gmail.com',
  'ymail.com': 'yahoo.com', 'yahoo.co.uk': 'yahoo.com', 'rocketmail.com': 'yahoo.com',
  'gmx.net': 'gmx.com', 'gmx.co.uk': 'gmx.com', 'gmx.de': 'gmx.com',
  'protonmail.com': 'proton.me', 'pm.me': 'proton.me'
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}

// Suggest connection settings for an email address. Known providers come back
// confirmed; anything else is a best guess (mail.<domain> on the usual ports)
// the user must confirm with their provider or web host.
export function suggestSettings(email: string): ProviderPreset {
  const domain = domainOf(email)
  const key = ALIASES[domain] ?? domain
  const known = PRESETS[key]
  if (known) return { ...known }

  // Unknown domain (business/website mailbox): the overwhelmingly common shape is
  // mail.<domain> on 993 (IMAP/SSL) and 465 (SMTP/SSL). Flag it as a guess.
  const host = domain ? `mail.${domain}` : ''
  return {
    provider: domain || 'Custom',
    imapHost: host, imapPort: COMMON_PORTS.imapSsl, imapSecurity: 'ssl',
    smtpHost: host, smtpPort: COMMON_PORTS.smtpSsl, smtpSecurity: 'ssl',
    confirmed: false,
    note: `These are the most common settings for a custom domain, but not confirmed for ${domain || 'this domain'}. The incoming server is usually mail.${domain || 'yourdomain'} on port 993 (SSL); the outgoing server the same host on 465 (SSL) or 587 (STARTTLS). Please confirm the exact host and ports with your email provider or web host before finishing.`
  }
}
