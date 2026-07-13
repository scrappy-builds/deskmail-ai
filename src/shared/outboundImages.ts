// Turn base64 data-URI images in outbound mail HTML into cid: inline attachments.
// Recipients' clients (Gmail, Outlook, most webmail) strip data-URI <img src>, so
// signature icons and pasted inline images arrive broken. A cid: reference to an
// attached image renders everywhere. Pure, so it's unit-tested.

export interface InlineImageAttachment {
  filename: string
  cid: string
  content: string // base64
  contentType: string
}

export interface InlinedHtml {
  html: string
  attachments: InlineImageAttachment[]
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp'
}

// Match src="data:<mime>;base64,<data>" (single or double quoted).
const DATA_IMG = /src=(["'])data:(image\/[a-z+.-]+);base64,([^"']+)\1/gi

export function inlineDataImages(html: string, idPrefix = 'img'): InlinedHtml {
  const attachments: InlineImageAttachment[] = []
  let n = 0
  const out = html.replace(DATA_IMG, (_m, q: string, mime: string, data: string) => {
    n += 1
    const cid = `${idPrefix}-${n}@deskmail.local`
    attachments.push({
      filename: `${idPrefix}-${n}.${EXT[mime.toLowerCase()] ?? 'bin'}`,
      cid,
      content: data,
      contentType: mime
    })
    return `src=${q}cid:${cid}${q}`
  })
  return { html: out, attachments }
}
