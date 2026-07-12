import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { sanitiseEmail } from './sanitise'
import { collapseQuotes } from './collapseQuotes'
import { isSimpleEmail } from './darkEmail'
import { externalHref } from './linkHandling'

// Wrap sanitised email HTML in a minimal document. Rendered on a white card so
// email HTML (which almost always assumes a light background) stays legible in
// both themes. In app-dark mode, "simple" emails can opt into a Thunderbird-
// style invert (images re-inverted so photos stay true); complex emails keep
// the white card — the contrast risk isn't worth it.
function wrap(inner: string, dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dm-dark' : ''}"><head><meta charset="utf-8">
<style>
  html,body{margin:0}
  body{background:#fff;color:#111;font:14px/1.65 'Hanken Grotesk',system-ui,sans-serif;padding:2px 4px;word-wrap:break-word;overflow-wrap:break-word}
  img{max-width:100%;height:auto}
  a{color:#1e7a38}
  table{max-width:100%}
  html.dm-dark body{filter:invert(0.92) hue-rotate(180deg)}
  html.dm-dark img{filter:invert(1.087) hue-rotate(180deg)}
  details.dm-quote>summary{list-style:none;cursor:pointer;display:inline-block;margin:6px 0;padding:0 10px;border:1px solid #d5d9e0;border-radius:10px;background:#f2f4f7;color:#5b6472;font-weight:700;letter-spacing:2px;line-height:1.5;user-select:none}
  details.dm-quote>summary::-webkit-details-marker{display:none}
  details.dm-quote[open]>summary{opacity:.6}
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
  // Per-message dark override (sun/moon chip); null = automatic. Not persisted —
  // start without persistence, add per-sender memory only if it proves annoying.
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Find-in-message (Ctrl/Cmd+F within the reading pane). The body lives in a
  // same-origin sandboxed iframe, so we can drive Chromium's window.find inside it.
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  const appDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  useEffect(() => setDarkOverride(null), [messageId])

  // Count occurrences in the rendered body text (window.find gives no total).
  const countMatches = (q: string): number => {
    if (!q) return 0
    const hay = (iframeRef.current?.contentDocument?.body?.textContent ?? '').toLowerCase()
    const needle = q.toLowerCase()
    let n = 0
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++
    return n
  }
  type FindWindow = Window & { find?: (s: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean }
  const navigate = (backwards: boolean): void => {
    const win = iframeRef.current?.contentWindow as FindWindow | null
    if (!win?.find || !query) return
    win.find(query, false, backwards, true) // selects + scrolls the match into view
  }
  const closeFind = (): void => {
    setFindOpen(false)
    setQuery('')
    iframeRef.current?.contentWindow?.getSelection?.()?.removeAllRanges?.()
  }
  const openFind = (): void => {
    setFindOpen(true)
    setTimeout(() => findInputRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (findOpen) setCount(countMatches(query))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, findOpen])
  // Reset the find bar when the message changes.
  useEffect(() => {
    setFindOpen(false)
    setQuery('')
  }, [messageId])
  // Ctrl/Cmd+F opens the bar when focus is in the pane (outside the iframe).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && html) {
        e.preventDefault()
        openFind()
      } else if (e.key === 'Escape' && findOpen) {
        closeFind()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, findOpen])

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

  const result = useMemo(() => {
    if (!html) return null
    const clean = sanitiseEmail(html, allowImages)
    // Quote collapsing runs after sanitising; it only adds our details/summary.
    return { ...clean, html: collapseQuotes(clean.html).html }
  }, [html, allowImages])

  // Dark transform: automatic only for simple emails in a dark app theme; the
  // chip below lets any message be flipped either way.
  const darkAuto = useMemo(() => appDark && !!html && isSimpleEmail(html), [appDark, html])
  const renderDark = darkOverride ?? darkAuto

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
    // Ctrl/Cmd+F while focus is inside the message frame opens the find bar too.
    doc.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        openFind()
      } else if (e.key === 'Escape') {
        closeFind()
      }
    })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {findOpen && (
        <div className="absolute left-3 top-2 z-20 flex items-center gap-1 rounded-lg border border-border bg-panel px-2 py-1.5 shadow-raised">
          <Icon name="search" size={13} className="flex-none text-text-3" />
          <input
            ref={findInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                navigate(e.shiftKey)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                closeFind()
              }
            }}
            placeholder="Find in message…"
            className="w-[150px] bg-transparent text-[12.5px] outline-none"
          />
          <span className="min-w-[62px] flex-none text-right text-[11px] text-text-3">
            {query ? (count > 0 ? `${count} match${count === 1 ? '' : 'es'}` : 'No matches') : ''}
          </span>
          <button onClick={() => navigate(true)} title="Previous" className="flex-none rounded-sm p-1 text-text-3 hover:text-accent">
            <Icon name="chevronDown" size={14} className="rotate-180" />
          </button>
          <button onClick={() => navigate(false)} title="Next" className="flex-none rounded-sm p-1 text-text-3 hover:text-accent">
            <Icon name="chevronDown" size={14} />
          </button>
          <button onClick={closeFind} title="Close" className="flex-none rounded-sm p-1 text-text-3 hover:text-accent">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
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
      {appDark && (
        <button
          onClick={() => setDarkOverride(!renderDark)}
          title={renderDark ? 'Show this message on the light card' : 'Show this message in dark'}
          className="absolute right-4 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-panel text-text-2 hover:text-accent"
          data-testid="dark-email-toggle"
        >
          <Icon name={renderDark ? 'sun' : 'moon'} size={14} />
        </button>
      )}
      <iframe
        ref={iframeRef}
        title="Message body"
        sandbox="allow-same-origin"
        srcDoc={wrap(result!.html, renderDark)}
        onLoad={onLoad}
        data-dark={renderDark || undefined}
        className="mt-3 w-full border-0"
        style={{ minHeight: 120, background: renderDark ? '#141414' : '#fff' }}
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
