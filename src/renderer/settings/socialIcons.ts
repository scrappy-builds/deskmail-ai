// Social-media icon block for HTML signatures. Icons are embedded as base64
// SVG data-URIs (not hot-linked) so they survive image-blocking in the
// recipient's client and in DeskMail's own reading pane.
// ponytail: SVG data-URIs are the smallest sharp option; some webmail (notably
// Gmail) strips SVG/data-URI images entirely — that's an unavoidable ceiling of
// "embed, don't hot-link", not a bug to fix here.

export interface SocialPlatform {
  id: string
  label: string
  placeholder: string
  svg: string
}

// Simple monochrome glyphs (grey, #555) so they sit neatly at the foot of a signature.
const G = '#555'
export const PLATFORMS: SocialPlatform[] = [
  { id: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/yourhandle',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/></svg>` },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/you',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="${G}"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 014 0v4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>` },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/yourpage',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="${G}"/><path d="M15 8h-2a2 2 0 00-2 2v10M9 13h6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>` },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/you',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="${G}" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="${G}" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="${G}"/></svg>` },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://www.tiktok.com/@you',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14 4v9a3 3 0 11-2-2.8V4h2c.5 2 2 3.5 4 3.7" fill="none" stroke="${G}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@you',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4" fill="${G}"/><path d="M10 9l5 3-5 3z" fill="#fff"/></svg>` },
  { id: 'website', label: 'Website', placeholder: 'https://example.com',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="${G}" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="${G}" stroke-width="1.5"/></svg>` }
]

// btoa isn't binary-safe for non-ASCII; our SVGs are ASCII so this is fine.
function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const START = '<!--deskmail-social-start-->'
const END = '<!--deskmail-social-end-->'

export interface SocialLink {
  id: string
  url: string
}

// Build the HTML row for the chosen platforms, wrapped in comment markers so we
// can pull it back out when the signature is re-opened for editing.
export function buildSocialRow(links: SocialLink[]): string {
  const items = links
    .filter((l) => l.url.trim())
    .map((l) => {
      const p = PLATFORMS.find((x) => x.id === l.id)
      if (!p) return ''
      const url = l.url.trim().replace(/"/g, '%22')
      // display:inline-block keeps the icons on one horizontal line even where a
      // CSS reset (e.g. Tailwind) would otherwise force img { display:block }.
      return `<a data-platform="${p.id}" href="${url}" target="_blank" style="display:inline-block;margin-right:8px;text-decoration:none"><img src="${dataUri(p.svg)}" alt="${p.label}" width="20" height="20" style="display:inline-block;vertical-align:middle;border:0"></a>`
    })
    .join('')
  if (!items) return ''
  return `${START}<div style="margin-top:10px">${items}</div>${END}`
}

// Split a stored signature body into its main HTML and the social block (if any).
export function splitSocial(body: string): { main: string; social: string } {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`)
  const m = re.exec(body)
  return m ? { main: body.replace(m[0], '').trim(), social: m[0] } : { main: body, social: '' }
}

// Recover platform → url from a previously-built social block, to refill the UI.
export function parseSocialRow(social: string): SocialLink[] {
  const re = /data-platform="([^"]+)"\s+href="([^"]*)"/g
  const out: SocialLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(social)) !== null) out.push({ id: m[1], url: m[2].replace(/%22/g, '"') })
  return out
}
