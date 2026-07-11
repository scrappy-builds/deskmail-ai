// Decide whether an email is "simple" enough to survive the Thunderbird-style
// dark transform (invert + hue-rotate). Emails that paint their own design —
// background images or lots of explicit background colours — stay on the white
// card, where they're guaranteed legible.

const MAX_EXPLICIT_BACKGROUNDS = 4

export function isSimpleEmail(html: string): boolean {
  if (/background(-image)?\s*:\s*url\(/i.test(html)) return false
  if (/<v:background/i.test(html)) return false
  const backgrounds = html.match(/background(-color)?\s*:|bgcolor\s*=/gi) ?? []
  return backgrounds.length <= MAX_EXPLICIT_BACKGROUNDS
}
