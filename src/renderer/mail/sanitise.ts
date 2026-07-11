import DOMPurify from 'dompurify'

export interface SanitiseResult {
  html: string
  blockedRemote: boolean // did we strip any remote images?
}

const REMOTE = /^\s*(https?:|\/\/)/i

// Sanitise email HTML for display. Always strips scripts and event handlers
// (DOMPurify) and, unless allowRemoteImages is true, removes remote image
// sources so tracking pixels don't phone home until the user opts in. The
// output is still rendered inside a sandboxed iframe (no scripts) as defence
// in depth — this function is the content-level guard.
export function sanitiseEmail(html: string, allowRemoteImages = false): SanitiseResult {
  let blockedRemote = false

  const purify = DOMPurify as unknown as typeof DOMPurify & {
    addHook: (h: string, cb: (node: Element) => void) => void
    removeHook: (h: string) => void
  }

  purify.addHook('uponSanitizeElement', (node: Element) => {
    if (allowRemoteImages) return
    // <img src> and srcset pointing at remote hosts.
    if (node.nodeName === 'IMG') {
      const src = node.getAttribute?.('src') ?? ''
      const srcset = node.getAttribute?.('srcset') ?? ''
      if (REMOTE.test(src)) {
        node.removeAttribute('src')
        blockedRemote = true
      }
      if (REMOTE.test(srcset)) {
        node.removeAttribute('srcset')
        blockedRemote = true
      }
    }
    // Inline background images: style="background:url(http...)".
    const style = node.getAttribute?.('style') ?? ''
    if (/url\(\s*['"]?\s*(https?:|\/\/)/i.test(style)) {
      node.setAttribute('style', style.replace(/url\([^)]*\)/gi, 'none'))
      blockedRemote = true
    }
  })

  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_DATA_ATTR: false
  }) as unknown as string

  purify.removeHook('uponSanitizeElement')
  return { html: clean, blockedRemote }
}
