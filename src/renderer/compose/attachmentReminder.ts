// "You wrote 'attached' but there's no attachment" — checked at Send.

// Strip quoted original text (reply chains) so the OTHER person's "see attached"
// never triggers the reminder — only words the user actually wrote count.
function withoutQuotes(html: string): string {
  let out = html
  // Innermost-first so nested quotes unwind completely.
  for (let i = 0; i < 20 && /<blockquote[\s>]/i.test(out); i++) {
    out = out.replace(/<blockquote[^>]*>(?:(?!<blockquote)[\s\S])*?<\/blockquote>/gi, ' ')
  }
  return out
}

// True if the compose body/subject hints at an attachment the user may have
// forgotten. Input is the editor HTML (plus subject text) — quoted reply text
// is excluded before matching.
export function mentionsAttachment(html: string): boolean {
  const text = withoutQuotes(html).replace(/<[^>]+>/g, ' ')
  return /\b(attach(ed|ment|ments|ing)?|enclosed|see the file|i've included|pfa)\b/i.test(text)
}
