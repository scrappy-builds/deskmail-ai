// Social-media icon block for HTML signatures. Icons are hosted 20px monochrome
// PNGs referenced by absolute HTTPS URL — not data-URIs or cid: attachments.
// Reasons: data-URIs are stripped by Gmail/Outlook/most webmail, and cid: images
// display but count as attachments (they clutter Outlook's attachment list). A
// hosted <img src="https://…"> displays inline and never attaches. Trade-off:
// clients that block remote images show them only after "load images" — fine for
// a signature, and once loaded for a known sender they persist.
//
// The source PNGs live in email-assets/icons/<id>.png; upload them to
// functional3duk.co.uk/email/icons/ so these URLs resolve. Lives in shared so the
// send path (main) can upgrade legacy signatures to this block too.

// Where the icon PNGs are hosted. Files: <id>.png (twitter, linkedin, …).
export const ICON_BASE_URL = 'https://functional3duk.co.uk/email/icons'

export interface SocialPlatform {
  id: string
  label: string
  placeholder: string
}

export const PLATFORMS: SocialPlatform[] = [
  { id: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/yourhandle' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/you' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/yourpage' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/you' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://www.tiktok.com/@you' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@you' },
  { id: 'website', label: 'Website', placeholder: 'https://example.com' }
]

function iconUrl(id: string): string {
  return `${ICON_BASE_URL}/${id}.png`
}

const START = "<!--deskmail-social-start-->"
const END = "<!--deskmail-social-end-->"

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
      if (!p) return ""
      const url = l.url.trim().replace(/"/g, "%22")
      // display:inline-block keeps the icons on one horizontal line even where a
      // CSS reset (e.g. Tailwind) would otherwise force img { display:block }.
      return `<a data-platform="${p.id}" href="${url}" target="_blank" style="display:inline-block;margin-right:8px;text-decoration:none"><img src="${iconUrl(p.id)}" alt="${p.label}" width="20" height="20" style="display:inline-block;vertical-align:middle;border:0"></a>`
    })
    .join("")
  if (!items) return ""
  return `${START}<div style="margin-top:10px">${items}</div>${END}`
}

// Split a stored signature body into its main HTML and the social block (if any).
export function splitSocial(body: string): { main: string; social: string } {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`)
  const m = re.exec(body)
  return m ? { main: body.replace(m[0], "").trim(), social: m[0] } : { main: body, social: "" }
}

// Recover platform -> url from a previously-built social block, to refill the UI.
export function parseSocialRow(social: string): SocialLink[] {
  const re = /data-platform="([^"]+)"\s+href="([^"]*)"/g
  const out: SocialLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(social)) !== null) out.push({ id: m[1], url: m[2].replace(/%22/g, '"') })
  return out
}

// Upgrade a legacy signature whose social icons were baked in as data-URIs (old
// SVG or PNG builds) to the hosted-URL block, so signatures saved before the
// switch still deliver. Pure: rebuilds the block from the platforms/urls already
// encoded in it (the data-platform/href attrs, independent of the <img> src).
export function upgradeLegacySocial(body: string): string {
  const { main, social } = splitSocial(body)
  if (!social || !social.includes("data:image")) return body
  const rebuilt = buildSocialRow(parseSocialRow(social))
  return rebuilt ? `${main}${rebuilt}` : main
}
