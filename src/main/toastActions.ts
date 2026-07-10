// Windows toast quick actions: the XML gives the notification Archive / Delete /
// Mark read buttons whose protocol arguments come back to us via deskmail://
// activation — no window needs to open. Pure string helpers, unit-tested.

const ALLOWED_OPS = new Set(['archive', 'trash', 'read', 'open'] as const)
export type ToastOp = 'archive' | 'trash' | 'read' | 'open'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildToastXml(sender: string, subject: string, messageId: number): string {
  const id = Math.floor(messageId)
  return [
    `<toast activationType="protocol" launch="deskmail://open/${id}">`,
    '<visual><binding template="ToastGeneric">',
    `<text>${escapeXml(sender)}</text>`,
    `<text>${escapeXml(subject)}</text>`,
    '</binding></visual>',
    '<actions>',
    `<action content="Archive" activationType="protocol" arguments="deskmail://action/archive/${id}"/>`,
    `<action content="Delete" activationType="protocol" arguments="deskmail://action/trash/${id}"/>`,
    `<action content="Mark read" activationType="protocol" arguments="deskmail://action/read/${id}"/>`,
    '</actions>',
    '</toast>'
  ].join('')
}

// Parse a deskmail:// activation URL. This string arrives from OUTSIDE the
// process (toast activation / command line), so be strict: known ops only,
// purely numeric ids, nothing else accepted.
export function parseActionUrl(url: string): { op: ToastOp; messageId: number } | null {
  const m = /^deskmail:\/\/(?:action\/([a-z]+)\/(\d{1,12})|(open)\/(\d{1,12}))\/?$/.exec(url.trim())
  if (!m) return null
  const op = (m[1] ?? m[3]) as ToastOp
  if (m[1] === 'open' || !ALLOWED_OPS.has(op)) return null // 'open' only via the launch form
  const id = Number(m[2] ?? m[4])
  if (!Number.isInteger(id) || id <= 0) return null
  return { op, messageId: id }
}
