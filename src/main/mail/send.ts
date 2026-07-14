import nodemailer, { type SendMailOptions } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { QUOTE_MARKER, type AccountRow, type ComposePayload, type SendResult } from '@shared/db'
import type { DB } from '../../db/database'
import { getCredential } from '../credentials'
import { getDefaultSignature, getSignatureBody } from '../../db/signatures'
import { upgradeLegacySocial } from '@shared/socialIcons'
import { inlineDataImages } from '@shared/outboundImages'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// A signature body may be rich HTML (bold/links) or legacy plain text with
// newlines — render either faithfully.
function signatureToHtml(body: string): string {
  return /<[a-z][\s\S]*>/i.test(body) ? body : escapeHtml(body).replace(/\n/g, '<br>')
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
  // Legacy signatures stored their social icons as SVG data-URIs (stripped by
  // most clients); upgrade to the PNG block before sending so old signatures work.
  const sig = o.signature ? upgradeLegacySocial(o.signature) : null
  const sigHtml = sig ? `<br><br>--<br>${signatureToHtml(sig)}` : ''
  // On a reply/forward the draft carries QUOTE_MARKER between the new text and the
  // quoted chain — drop the signature there so it sits under the reply, not the
  // whole quote. New mail has no marker, so it lands at the end of the body.
  const body = o.payload.bodyHtml.includes(QUOTE_MARKER)
    ? o.payload.bodyHtml.replace(QUOTE_MARKER, sigHtml)
    : `${o.payload.bodyHtml}${sigHtml}`
  // Convert every embedded data-URI image (signature icons + inline pastes) into a
  // cid: inline attachment so it renders in the recipient's client.
  const { html, attachments: inlineImgs } = inlineDataImages(body)
  const fileAttachments = o.payload.attachments?.map((a) => ({ filename: a.name, path: a.path })) ?? []
  return {
    from: `"${o.fromName}" <${o.fromEmail}>`,
    to: o.payload.to.join(', '),
    cc: o.payload.cc.length ? o.payload.cc.join(', ') : undefined,
    bcc: o.payload.bcc.length ? o.payload.bcc.join(', ') : undefined,
    subject: o.payload.subject,
    html,
    attachments: [...inlineImgs, ...fileAttachments],
    // nodemailer maps this to X-Priority + Importance headers (omit when normal).
    priority: o.payload.importance && o.payload.importance !== 'normal' ? o.payload.importance : undefined,
    // Calendar invites ride along as a proper text/calendar MIME part.
    icalEvent: o.payload.icalEvent
  }
}

// Compile the exact same options nodemailer sends into a raw RFC822 message,
// for the IMAP Sent-folder copy. Pure over its input.
export function buildRaw(mail: SendMailOptions): Promise<Buffer> {
  return new MailComposer(mail).compile().build()
}

// Send via the account's SMTP server. Only ever called from the mail:send IPC,
// which is only triggered by the user's explicit Send action — never automatic.
// On success, `raw` carries the compiled RFC822 copy for the Sent folder (it is
// stripped before the result crosses IPC to the renderer).
export async function sendMail(db: DB, payload: ComposePayload): Promise<SendResult & { raw?: Buffer }> {
  const acc = db.get('SELECT * FROM accounts WHERE id = ?', [payload.accountId]) as unknown as AccountRow | undefined
  if (!acc) return { ok: false, error: 'Account not found.' }
  const password = getCredential(db, payload.accountId)
  if (!password) return { ok: false, error: 'No stored password for this account.' }

  // An explicitly-chosen signature is always appended; otherwise the account
  // default is used only when it's set to append to new messages.
  const signature = payload.signatureId != null ? getSignatureBody(db, payload.signatureId) : getDefaultSignature(db, payload.accountId)

  const mail = buildMail({
    payload,
    fromName: acc.display_name,
    fromEmail: acc.email_address,
    signature
  })

  const transport = nodemailer.createTransport({
    host: acc.outgoing_host,
    port: acc.outgoing_port,
    secure: acc.outgoing_security === 'ssl',
    requireTLS: acc.outgoing_security === 'starttls',
    auth: { user: acc.username, pass: password },
    connectionTimeout: 20000,
    // Inactivity timeout (reset by transfer activity), so a genuinely stalled
    // upload of a big attachment fails and frees the Outbox queue rather than
    // hanging forever. Generous enough for large files on a slow connection.
    socketTimeout: 10 * 60 * 1000
  })

  try {
    await transport.sendMail(mail)
    const raw = await buildRaw(mail).catch(() => undefined)
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Sending failed.' }
  }
}
