import type { DB } from './database'
import { getAppSetting, setAppSetting } from './settings'

// A small local Bayesian classifier that learns from what the owner marks —
// junk/not-junk by default, and (reusing the same machinery) Focused/Other for
// the focused inbox. Token counts live in a per-category table; message totals
// in app_settings under the category's key prefix.

// The classifier writes table names into SQL, so only these exact identifiers
// are ever accepted — never caller-supplied strings.
const TOKEN_TABLES = new Set(['junk_tokens', 'focus_tokens'])
function assertTable(table: string): void {
  if (!TOKEN_TABLES.has(table)) throw new Error(`Unknown token table: ${table}`)
}

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

function counts(db: DB, prefix: string): { nspam: number; nham: number } {
  return {
    nspam: Number(getAppSetting(db, `${prefix}-spam-count`) ?? '0'),
    nham: Number(getAppSetting(db, `${prefix}-ham-count`) ?? '0')
  }
}

// Only trust the filter once it's seen a few of each — before that, defer to the
// rule-based classifier alone.
export function isBayesTrained(db: DB, prefix = 'junk'): boolean {
  const { nspam, nham } = counts(db, prefix)
  return nspam >= 3 && nham >= 3
}

export function trainBayes(db: DB, text: string, isSpam: boolean, table = 'junk_tokens', prefix = 'junk'): void {
  assertTable(table)
  const col = isSpam ? 'spam' : 'ham' // fixed identifiers, not user input
  for (const t of tokenize(text)) {
    db.run(
      `INSERT INTO ${table} (token, ${col}) VALUES (?, 1)
       ON CONFLICT(token) DO UPDATE SET ${col} = ${col} + 1`,
      [t]
    )
  }
  const key = `${prefix}-${isSpam ? 'spam' : 'ham'}-count`
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

// "Spam-side" probability 0..1 for a piece of text (0 when untrained). For the
// focus classifier, spam-side = Other and ham-side = Focused.
export function scoreSpam(db: DB, text: string, table = 'junk_tokens', prefix = 'junk'): number {
  assertTable(table)
  const { nspam, nham } = counts(db, prefix)
  if (nspam === 0 || nham === 0) return 0
  const probs = tokenize(text).map((t) => {
    const row = db.get(`SELECT spam, ham FROM ${table} WHERE token = ?`, [t]) as { spam: number; ham: number } | undefined
    return tokenProb(row?.spam ?? 0, row?.ham ?? 0, nspam, nham)
  })
  return combineProbabilities(probs)
}
