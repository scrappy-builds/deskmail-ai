// Deciding which links in a rendered email get handed to the OS browser, and
// pulling the href off a clicked/hovered element. Kept free of React/DOM imports
// so it's unit-testable on its own.

// Only http(s) links go to the browser (not mailto:, relative, or javascript:).
export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

// Find the enclosing <a> of an event target and return its http(s) href, else
// null. The target lives in the email iframe's realm, so `instanceof Element`
// (parent realm) is always false — duck-type on `.closest` instead.
export function externalHref(target: EventTarget | null): string | null {
  const el = (target as Element | null)?.closest?.('a') ?? null
  const href = el?.getAttribute('href') ?? ''
  return isExternalUrl(href) ? href : null
}
