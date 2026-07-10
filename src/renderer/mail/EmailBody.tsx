import { useEffect, useMemo, useRef, useState } from 'react'
import { sanitiseEmail } from './sanitise'
import { externalHref } from './linkHandling'

// Wrap sanitised email HTML in a minimal document. Rendered on a white card so
// email HTML (which almost always assumes a light background) stays legible in
// both themes. ponytail: white email card like most clients; per-message dark
// remapping isn't worth the contrast risk.
function wrap(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0}
  body{background:#fff;color:#111;font:14px/1.65 'Hanken Grotesk',system-ui,sans-serif;padding:2px 4px;word-wrap:break-word;overflow-wrap:break-word}
  img{max-width:100%;height:auto}
  a{color:#1e7a38}
  table{max-width:100%}
</style></head><body>${inner}</body></html>`
}

// Remembers messages where the user chose to load images, so switching folders
// and back doesn't re-block them. ponytail: in-memory; resets on app restart —
// a junk message re-blocks after restart, which is the safe default.
const imagesLoaded = new Set<number>()

// Initial image state: auto-load unless the caller blocks by default (Junk), but
// always honour a remembered manual "Load images" for this message.
export function initialAllow(allowByDefault: boolean, remembered: boolean): boolean {
  return allowByDefault || remembered
}

export function EmailBody({
  html,
  text,
  allowByDefault = true,
  messageId,
  senderEmail
}: {
  html: string | null
  text: string | null
  allowByDefault?: boolean
  messageId?: number
  senderEmail?: string | null
}): JSX.Element {
  const remembered = messageId != null && imagesLoaded.has(messageId)
  const [allowImages, setAllowImages] = useState(initialAllow(allowByDefault, remembered))
  const [hoverUrl, setHoverUrl] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // A persisted "always for this sender" choice unblocks images on open.
  useEffect(() => {
    if (allowImages || !senderEmail) return
    let live = true
    void window.deskmail.trust.is(senderEmail).then((trusted) => {
      if (live && trusted) setAllowImages(true)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderEmail, messageId])

  const result = useMemo(() => (html ? sanitiseEmail(html, allowImages) : null), [html, allowImages])

  if (!html) {
    return <div className="whitespace-pre-line px-6 py-5 text-[14px] leading-[1.65] text-text">{text ?? ''}</div>
  }

  // Size the frame to its content so the reading pane scrolls as one page.
  // sandbox has no allow-scripts, so nothing in the email can run.
  const onLoad = (): void => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    iframeRef.current!.style.height = `${doc.documentElement.scrollHeight + 8}px`
    // Anchor clicks would otherwise dead-end inside the sandboxed frame (blank
    // screen). Intercept them and open http(s) links in the default browser.
    doc.addEventListener('click', (e) => {
      const url = externalHref(e.target)
      if (url) {
        e.preventDefault()
        window.deskmail.openExternal(url)
      }
    })
    // Show where a link points on hover (the frameless window has no status bar).
    doc.addEventListener('mouseover', (e) => setHoverUrl(externalHref(e.target)))
    doc.addEventListener('mouseleave', () => setHoverUrl(null))
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {result?.blockedRemote && !allowImages && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-[12.5px]"
          style={{ borderColor: 'var(--border-2)', background: 'var(--bg-3)', color: 'var(--text-2)' }}
        >
          <span className="flex-1">
            I've blocked remote images in this message to protect your privacy.
          </span>
          <button
            onClick={() => {
              setAllowImages(true)
              if (messageId != null) imagesLoaded.add(messageId)
            }}
            className="rounded-sm px-2.5 py-1 text-[12px] font-semibold text-accent hover:underline"
          >
            Load images
          </button>
          {senderEmail && (
            <button
              onClick={() => {
                setAllowImages(true)
                void window.deskmail.trust.add(senderEmail)
              }}
              title={`Always load images from ${senderEmail} (change later in Settings → Security)`}
              className="rounded-sm px-2.5 py-1 text-[12px] font-semibold text-accent hover:underline"
            >
              Always from this sender
            </button>
          )}
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Message body"
        sandbox="allow-same-origin"
        srcDoc={wrap(result!.html)}
        onLoad={onLoad}
        className="mt-3 w-full border-0 bg-white"
        style={{ minHeight: 120 }}
      />
      {hoverUrl && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 z-10 max-w-[80%] truncate rounded-tr-md border px-2.5 py-1 text-[11px]"
          style={{ borderColor: 'var(--border-2)', background: 'var(--bg-2)', color: 'var(--text-2)' }}
        >
          {hoverUrl}
        </div>
      )}
    </div>
  )
}
