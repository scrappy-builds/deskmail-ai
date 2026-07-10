// Collapse quoted reply history behind a native <details> disclosure, so long
// threads read as one message with a "···" pill instead of six levels of quotes.
// Runs AFTER DOMPurify — the only markup added is our own details/summary.
// <details> toggling is native browser behaviour, so it works inside the
// sandboxed (no-scripts) email iframe.

const QUOTE_SELECTOR = 'blockquote, div.gmail_quote, #divRplyFwdMsg, #OutlookMessageHeader'
const PLAIN_MARKER = /-{2,}\s*Original Message\s*-{2,}/i

// Header-style markers (Outlook, plain-text "Original Message") introduce the
// quoted mail that FOLLOWS them, so those collapse with their following siblings.
function isHeaderMarker(el: Element): boolean {
  const id = el.id.toLowerCase()
  return id === 'divrplyfwdmsg' || id === 'outlookmessageheader'
}

export function collapseQuotes(html: string): { html: string; hadQuote: boolean } {
  if (!/blockquote|gmail_quote|divRplyFwdMsg|OutlookMessageHeader|Original Message/i.test(html)) {
    return { html, hadQuote: false } // fast path: nothing quote-like at all
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body

  // The OUTERMOST quote container only — nested quotes collapse along with it.
  let target: Element | null = null
  for (const el of body.querySelectorAll(QUOTE_SELECTOR)) {
    if (el.parentElement?.closest(QUOTE_SELECTOR)) continue
    target = el
    break
  }

  // Plain-text style "----- Original Message -----" marker inside an element.
  let markerMode = false
  if (!target) {
    for (const el of body.querySelectorAll('p, div, span')) {
      if (PLAIN_MARKER.test(el.textContent ?? '') && !el.querySelector('p, div')) {
        target = el
        markerMode = true
        break
      }
    }
  }
  if (!target) return { html, hadQuote: false }

  const details = doc.createElement('details')
  details.className = 'dm-quote'
  const summary = doc.createElement('summary')
  summary.textContent = '···'
  summary.title = 'Show quoted text'
  details.appendChild(summary)

  target.parentNode?.insertBefore(details, target)
  if (markerMode || isHeaderMarker(target)) {
    // The header plus everything after it is the quoted message.
    let node: ChildNode | null = target
    while (node) {
      const next: ChildNode | null = node.nextSibling
      details.appendChild(node)
      node = next
    }
  } else {
    details.appendChild(target)
  }

  return { html: body.innerHTML, hadQuote: true }
}
