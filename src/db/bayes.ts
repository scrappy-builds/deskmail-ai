import type { DB } from './database'
import { getAppSetting, setAppSetting } from './settings'

// A small local Bayesian spam filter that learns from what the owner marks junk
// / not junk — same idea as SpamAssassin/Thunderbird's adaptive filter, entirely
// on this PC. Token counts live in `junk_tokens`; message totals in app_settings.

// Lowercase alphanumeric words (len >= 3), de-duplicated per message (presence-
// based, à la Paul Graham), capped so a huge email can't dominate.
export function tokenize(text: string): string[] {
  const seen = new Set<string>()
  for (const w of text.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []) {
    seen.add(w)
    if (seen.size >= 300) break
  }
  return [...seen]
}

// p(spam | token), Graham-style, smoothed and clamped. Unseen tokens lean ham.
export function tokenProb(spam: number, ham: number, nspam: number, nham: number): number {
  if (spam + ham === 0) return 0.4
  const rs = Math.min(1, spam / Math.max(1, nspam))
  const rh = Math.min(1, ham / Math.max(1, nham))
  const p = rs / (rs + rh)
  return Math.max(0.01, Math.min(0.99, p))
}

// Combine the most telling token probabilities (furthest from 0.5) into a score.
export function combineProbabilities(probs: number[], top = 15): number {
  const chosen = [...probs].sort((a, b) => Math.abs(b - 0.5) - Math.abs(a - 0.5)).slice(0, top)
  if (chosen.length === 0) return 0
  let prod = 1
  let comp = 1
  for (const p of chosen) {
    prod *= p
    comp *= 1 - p
  }
  return prod / (prod + comp)
}

function counts(db: DB): { nspam: number; nham: number } {
  return {
    nspam: Number(getAppSetting(db, 'junk-spam-count') ?? '0'),
    nham: Number(getAppSetting(db, 'junk-ham-count') ?? '0')
  }
}

// Only trust the filter once it's seen a few of each — before that, defer to the
// rule-based classifier alone.
export function isBayesTrained(db: DB): boolean {
  const { nspam, nham } = counts(db)
  return nspam >= 3 && nham >= 3
}

export function trainBayes(db: DB, text: string, isSpam: boolean): void {
  const col = isSpam ? 'spam' : 'ham' // fixed identifiers, not user input
  for (const t of tokenize(text)) {
    db.run(
      `INSERT INTO junk_tokens (token, ${col}) VALUES (?, 1)
       ON CONFLICT(token) DO UPDATE SET ${col} = ${col} + 1`,
      [t]
    )
  }
  const key = isSpam ? 'junk-spam-count' : 'junk-ham-count'
  setAppSetting(db, key, String(Number(getAppSetting(db, key) ?? '0') + 1))
}

// Train from a stored message (subject + sender + body).
export function trainBayesFromMessage(db: DB, messageId: number, isSpam: boolean): void {
  const r = db.get('SELECT subject, from_name, from_email, body_text FROM messages WHERE id = ?', [messageId]) as
    | { subject: string | null; from_name: string | null; from_email: string | null; body_text: string | null }
    | undefined
  if (!r) return
  trainBayes(db, `${r.subject ?? ''} ${r.from_name ?? ''} ${r.from_email ?? ''} ${r.body_text ?? ''}`, isSpam)
}

// Spam probability 0..1 for a piece of text (0 when untrained).
export function scoreSpam(db: DB, text: string): number {
  const { nspam, nham } = counts(db)
  if (nspam === 0 || nham === 0) return 0
  const probs = tokenize(text).map((t) => {
    const row = db.get('SELECT spam, ham FROM junk_tokens WHERE token = ?', [t]) as { spam: number; ham: number } | undefined
    return tokenProb(row?.spam ?? 0, row?.ham ?? 0, nspam, nham)
  })
  return combineProbabilities(probs)
}
