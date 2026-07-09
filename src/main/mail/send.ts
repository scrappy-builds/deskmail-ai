import nodemailer, { type SendMailOptions } from 'nodemailer'
import type { AccountRow, ComposePayload, SendResult } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { getDefaultSignature } from '../../db/signatures'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface BuildMailOpts {
  payload: ComposePayload
  fromName: string
  fromEmail: string
  signature: string | null
}

// Pure: turn a compose payload (+ signature) into nodemailer options.
// The signature is appended here (the editor body doesn't contain it), so it's
// consistent whether the message is sent now or scheduled later.
export function buildMail(o: BuildMailOpts): SendMailOptions {
  const sigHtml = o.signature
    ? `<br><br>--<br>${escapeHtml(o.signature).replace(/\n/g, '<br>')}`
    : ''
  return {
    from: `"${o.fromName}" <${o.fromEmail}>`,
    to: o.payload.to.join(', '),
    cc: o.payload.cc.length ? o.payload.cc.join(', ') : undefined,
    bcc: o.payload.bcc.length ? o.payload.bcc.join(', ') : undefined,
    subject: o.payload.subject,
    html: `${o.payload.bodyHtml}${sigHtml}`,
    attachments: o.payload.attachments?.map((a) => ({ filename: a.name, path: a.path }))
  }
}

// Send via the account's SMTP server. Only ever called from the mail:send IPC,
// which is only triggered by the user's explicit Send action — never automatic.
export async function sendMail(db: DB, payload: ComposePayload): Promise<SendResult> {
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [payload.accountId]) as unknown as AccountRow | undefined
  if (!acc) return { ok: false, error: 'Account not found.' }
  const password = getCredential(db, payload.accountId)
  if (!password) return { ok: false, error: 'No stored password for this account.' }

  const mail = buildMail({
    payload,
    fromName: acc.display_name,
    fromEmail: acc.email_address,
    signature: getDefaultSignature(db, payload.accountId)
  })

  const transport = nodemailer.createTransport({
    host: acc.outgoing_host,
    port: acc.outgoing_port,
    secure: acc.outgoing_security === 'ssl',
    requireTLS: acc.outgoing_security === 'starttls',
    auth: { user: acc.username, pass: password },
    connectionTimeout: 20000
  })

  try {
    await transport.sendMail(mail)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Sending failed.' }
  }
}
