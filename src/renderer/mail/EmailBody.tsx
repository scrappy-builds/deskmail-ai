import { useMemo, useRef, useState } from 'react'
import { sanitiseEmail } from './sanitise'

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

export function EmailBody({ html, text }: { html: string | null; text: string | null }): JSX.Element {
  const [allowImages, setAllowImages] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const result = useMemo(() => (html ? sanitiseEmail(html, allowImages) : null), [html, allowImages])

  if (!html) {
    return <div className="whitespace-pre-line px-6 py-5 text-[14px] leading-[1.65] text-text">{text ?? ''}</div>
  }

  // Size the frame to its content so the reading pane scrolls as one page.
  // sandbox has no allow-scripts, so nothing in the email can run.
  const onLoad = (): void => {
    const doc = iframeRef.current?.contentDocument
    if (doc) iframeRef.current!.style.height = `${doc.documentElement.scrollHeight + 8}px`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {result?.blockedRemote && !allowImages && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-[12.5px]"
          style={{ borderColor: 'var(--border-2)', background: 'var(--bg-3)', color: 'var(--text-2)' }}
        >
          <span className="flex-1">
            I've blocked remote images in this message to protect your privacy.
          </span>
          <button
            onClick={() => setAllowImages(true)}
            className="rounded-sm px-2.5 py-1 text-[12px] font-semibold text-accent hover:underline"
          >
            Load images
          </button>
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
    </div>
  )
}
