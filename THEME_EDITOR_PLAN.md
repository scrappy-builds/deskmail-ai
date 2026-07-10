# DeskMail AI — Theme Editor plan

> Plan only. Nothing here is built yet. This document describes what the full theme
> editor (from `IMPROVEMENTS.md`, Tier 3) would look like, how it would be built, and
> how it would behave in the app. Implementation is a separate later job.

---

## The short version (plain language)

Think of the app's colours like a row of paint pots — one pot for the background, one
for the panels, one for the text, one for the green accent, and so on. Right now there
are two fixed sets of pots: a **Light** set and a **Dark** set. When you flip the theme
switch, the app swaps one whole set of pots for the other.

The theme editor is just a screen that lets **you** open the pots and change the paint.
You pick a region ("panel background"), choose a colour, and the whole app repaints
instantly because every part of the app is already told to "use whatever's in the panel
pot" rather than a hard-coded colour.

A **colour scheme** is one full set of pots that you've named and saved (e.g. "Warm
Evening"). You can make several, switch between them from a menu, and the app remembers
which one you were using — even after an update. And because your schemes are saved in
the same settings the app already backs up, they ride along with your database and
contacts backups automatically, plus you can export a single scheme to a small file to
share or re-import later.

---

## Why this is far smaller than the "[big]" label suggests

The groundwork is already done. Two facts from the current codebase change everything:

1. **The app is already fully variable-driven.** `tailwind.config.ts` maps every colour
   (`bg`, `panel`, `text`, `accent`, `star`, `danger`…) to a CSS variable like
   `var(--bg)`. Those variables are defined once in `src/renderer/styles.css` under
   `:root` (light) and `[data-theme='dark']` (dark). **~26 tokens control the entire
   UI.** Nothing in the app hard-codes a hex value it needs to re-theme. So "recolour the
   whole app" = "change the value of a CSS variable" — which is a one-line DOM operation,
   not a repaint of components.

2. **Settings already survive updates by design.** `src/main/settings.ts`
   `loadSettings()` merges the saved file **over** the defaults:
   `{ ...DEFAULT_SETTINGS, ...parsed }`. That merge is *exactly* the "remember my setup
   across updates" mechanism. Add new fields for custom themes and an old/partial file
   still loads cleanly — new keys fall back to defaults, existing keys are preserved.

3. **Backup already includes settings.** `src/main/backup.ts` copies `settings.json`
   into every backup folder. If custom themes live in settings, **they are already backed
   up and restored** with the database and attachments — zero extra work for the "backs
   up alongside your email database / contacts" requirement.

So the realistic effort is **[med]**, not [big]: one editor screen, a small data-model
addition, one runtime "apply custom variables" function, and a thin export/import pair.
The hard architecture (variable-driven theming + merge-safe settings + backup coverage)
already exists.

---

## What you'll be able to do (behaviour)

From **Settings → Appearance**, a new "Custom themes" area:

- **See your schemes** as a list of cards (name + a little colour-swatch preview).
- **Create a scheme** — starts as a copy of the current Light or Dark set so you're never
  editing from black-on-black.
- **Edit a scheme** — the editor opens. Click a region in a live mini-preview (or pick
  from a labelled list), set its colour with a colour picker, watch the whole app update
  live behind the panel.
- **Save** — names it and stores it. It appears in the scheme list and in the quick theme
  menu.
- **Switch** — pick any scheme (built-in Light, built-in Dark, or any custom one) from the
  Appearance screen or the existing theme toggle spot. Applies instantly.
- **Duplicate / rename / delete** custom schemes.
- **Export** one scheme to a `.deskmailtheme` file (plain JSON) via a save dialog.
- **Import** a scheme file via an open dialog; it's added to your list.
- **Reset** a scheme back to its starting point, or reset the whole app to built-in themes.

Icons stay as they are (per the IMPROVEMENTS.md note) — only colour tokens change.

---

## Data model

### Current shape
`AppSettings = LayoutPreferences` (`src/shared/types.ts:45`). `theme: 'light' | 'dark'`
lives inside it. `DEFAULT_LAYOUT` in `src/shared/layout.ts` holds the defaults.

### Additions (all in `src/shared/layout.ts`, so renderer + main + tests share them)

```ts
// One theme = a name + a full set of token overrides. Values are CSS colour
// strings (hex, rgb, hsl — whatever the picker emits). Missing keys inherit the
// base set, so a theme need only store what it changes.
export type ThemeTokens = Partial<Record<ThemeTokenKey, string>>

export interface CustomTheme {
  id: string          // stable slug, e.g. 'warm-evening' (crypto.randomUUID or slug)
  name: string        // user-facing label
  base: 'light' | 'dark'  // which built-in set fills any unspecified token
  tokens: ThemeTokens     // the overrides the user set
}

// The 26 editable tokens, grouped for the UI. Keys match the CSS var names
// (minus the leading --), so applying a token is just: setProperty('--' + key, value)
export type ThemeTokenKey =
  | 'bg' | 'bg-2' | 'bg-3' | 'bg-inset' | 'bg-hover'
  | 'border' | 'border-2'
  | 'text' | 'text-2' | 'text-3'
  | 'accent' | 'accent-2' | 'accent-fg'
  | 'claude' | 'star' | 'green' | 'red'
  // shadow / *-soft are DERIVED, not edited directly (see "Derived tokens")
```

Extend `LayoutPreferences`:

```ts
customThemes: CustomTheme[]     // default: []
activeThemeId: string | null    // null = use built-in `theme`; else a CustomTheme.id
```

`theme: 'light' | 'dark'` **stays** — it remains the built-in fallback and the `base`
for new custom themes, and keeps the existing light/dark toggle working untouched.

### Why store overrides, not full sets
A theme that only tweaks the accent shouldn't freeze the other 25 tokens — if a future
update improves the default dark greys, a mostly-default custom theme should inherit
that improvement. Storing only what the user changed keeps themes light and future-proof.
(If that proves surprising in practice, storing full sets is a trivial switch later.)

---

## Applying a theme at runtime

Today `layoutStore.hydrate()` / `setPref('theme', …)` do one thing:
`document.documentElement.setAttribute('data-theme', prefs.theme)`. That swaps the
built-in light/dark variable block.

Add one pure helper and call it in the same two places:

```ts
// Given the resolved theme, paint it onto the root element.
function applyTheme(prefs: LayoutPreferences): void {
  const root = document.documentElement
  const active = prefs.customThemes.find(t => t.id === prefs.activeThemeId)

  if (!active) {
    // Built-in path — unchanged behaviour. Clear any custom overrides first.
    clearCustomVars(root)
    root.setAttribute('data-theme', prefs.theme)
    return
  }

  // Custom path: use the base set as the floor, then layer overrides as inline
  // vars on :root (inline style beats the stylesheet's :root / [data-theme] rules).
  root.setAttribute('data-theme', active.base)      // fills the 25 you didn't touch
  for (const [key, value] of Object.entries(active.tokens)) {
    root.style.setProperty(`--${key}`, value)
  }
  applyDerivedVars(root, active)                    // shadows + *-soft, see below
}
```

That's the entire "recolour the whole app" engine. Because Tailwind classes already read
`var(--bg)` etc., **every component updates with no component changes**. Live preview in
the editor is the same call fired on each picker change (debounced), so the app repaints
behind the editor as you drag the colour.

### Derived tokens (don't make the user set these)
`styles.css` derives a few values from the primaries:
- `--accent-soft` / `--claude-soft` = `color-mix(... 16–18% …, transparent)`
- `--shadow` = large blurred box-shadow tuned per light/dark.

Keep these derived, not editable:
- `*-soft`: re-derive with the same `color-mix` from the user's chosen `accent` / `claude`.
  We can set them as inline vars too, computed in JS, or leave the CSS `color-mix` rules
  in place (they already reference `var(--accent)`, so they follow automatically — likely
  zero code needed).
- `--shadow`: inherit from the chosen `base` (light/dark). Not worth a picker.

This keeps the editor to **17 meaningful swatches**, grouped, instead of an intimidating
wall of 26.

---

## The editor UI

Lives as a new component (e.g. `src/renderer/settings/ThemeEditor.tsx`) opened from the
**Appearance** pane. Layout, matching the app's existing settings style:

```
┌───────────────────────────── Theme editor ──────────────────────────────┐
│  Name: [ Warm Evening            ]      Base: (•)Dark ( )Light           │
│                                                                          │
│  ┌─── Live preview (a shrunken mock of the app) ───┐   ┌─ Colours ────┐ │
│  │  sidebar │ list │ reading pane                  │   │ Surfaces      │ │
│  │  (clicking a region selects its token at right)│   │  ■ Background │ │
│  │                                                 │   │  ■ Panel      │ │
│  │                                                 │   │  ■ Raised     │ │
│  └─────────────────────────────────────────────────┘   │  ■ Inset      │ │
│                                                          │ Text          │ │
│  Selected: Panel background   [ #181818 ] [colour picker]│  ■ Primary    │ │
│                                                          │  ■ Secondary  │ │
│  [ Reset token ]  [ Reset all ]        [ Cancel ] [ Save ]  Accent …    │ │
└──────────────────────────────────────────────────────────────────────────┘
```

Grouping (headers + swatches):
- **Surfaces** — Background (`bg`), Panel (`bg-2`), Raised (`bg-3`), Inset (`bg-inset`),
  Hover (`bg-hover`)
- **Borders** — Border (`border`), Strong border (`border-2`)
- **Text** — Primary (`text`), Secondary (`text-2`), Muted (`text-3`)
- **Accent** — Accent (`accent`), Accent hover (`accent-2`), Accent text (`accent-fg`)
- **Status & marks** — Claude (`claude`), Star (`star`), Success (`green`), Danger (`red`)

### The colour picker — use the native one (ladder rung 3)
`<input type="color">` is a real, native OS colour picker with a live swatch, zero
dependencies, and it's already how the browser wants you to pick colours. Pair it with a
text field so hex can be typed/pasted (and to show the current value). **No picker
library.** If, and only if, HSL sliders or alpha are later wanted, revisit — but the
brand palette is solid hex, so the native picker covers it.

```tsx
<input type="color" value={hexOf(token)} onChange={e => setToken(key, e.target.value)} />
<input type="text"  value={valueOf(token)} onChange={e => setToken(key, e.target.value)} />
```

### Click-a-region selection
Each block in the mini-preview carries a `data-token` attribute; clicking it scrolls to
and highlights that swatch on the right. This satisfies the "click a region, set its
colour" idea from IMPROVEMENTS.md without a custom hit-testing system — it's just click
handlers on labelled divs.

### Live preview
Two options, pick the simpler that works:
- **A: apply to the real app while editing.** `applyTheme` a draft on every change; on
  Cancel, re-apply the previously active theme. Simplest, most impressive ("the actual
  app recolours live"). Chosen default.
- B: render an isolated preview inside a scoped element with the draft vars set locally.
  Safer (no flicker/leftover on cancel) but more code. Only if A feels risky in testing.

### Accessibility guard (do not skip)
Show a small contrast readout for text-on-surface pairs (WCAG ratio, computed in JS from
two hex values — ~10 lines, no library). A gentle "⚠ low contrast" note when
text/background drops below ~4.5:1. This is an accessibility basic, not a nice-to-have —
it stops a user accidentally making the app unreadable and being unable to find the
setting to fix it.

---

## Multiple schemes & switching

- **Store:** `customThemes: CustomTheme[]` holds them all; `activeThemeId` says which is
  live (or `null` for built-in light/dark).
- **Switch from Appearance:** the existing preset-card pattern (`ViewSettings.tsx`
  already renders selectable cards for layouts) is reused for theme cards. Selecting one
  sets `activeThemeId` and calls `applyTheme`.
- **Switch from the toggle:** the current light/dark toggle (`toggleTheme` in
  `layoutStore.ts`, surfaced in `TitleBar`/`CommandBar`) becomes a small dropdown:
  Light · Dark · —— · [your custom schemes]. Picking a built-in sets `activeThemeId =
  null` and the `theme` value; picking a custom sets `activeThemeId`.
- **New store actions** in `layoutStore.ts`, each persisting via the existing `persist()`:
  `addTheme`, `updateTheme`, `deleteTheme`, `duplicateTheme`, `setActiveTheme`.

All of this flows through the **existing** `saveSettings` IPC → `settings.ts` → JSON file.
No new persistence layer.

---

## Remembering the scheme across app updates

This is already solved by the architecture; the plan just needs to not break it:

1. Custom themes and `activeThemeId` live in `settings.json` (via the extended
   `LayoutPreferences`).
2. `loadSettings()` merges saved-over-defaults, so after an update the old file loads and
   your `customThemes` / `activeThemeId` / layout / everything come straight back.
3. On launch, `hydrate()` reads settings and calls `applyTheme` — the app comes up wearing
   exactly the scheme you left it in.

**One rule to keep it robust across versions:** when applying, always resolve tokens over
a *base* built-in set and ignore unknown keys. So if a future version renames or adds a
token, an old saved theme still applies cleanly (new tokens fall back to base; retired
tokens are harmlessly ignored). Add a `version: 1` field to `CustomTheme` now so a future
migration has something to switch on — cheap insurance.

---

## Export / import (rides with the existing backup story)

### Automatic (no work needed)
Because themes live in `settings.json` and `backup.ts` already copies `settings.json`,
custom themes are **already** included in every full backup/restore and every scheduled
auto-backup. The "backs up at the same time as your email database and contacts" line in
the request is satisfied for free.

### Explicit single-theme export/import (small addition)
For sharing one scheme (e.g. sending "Warm Evening" to someone, or the Norway licensee):

- **Main process** — two tiny IPC handlers beside the storage ones in `index.ts`:
  - `theme:export` → `dialog.showSaveDialog` (default name `<slug>.deskmailtheme`), write
    `JSON.stringify(theme, null, 2)`.
  - `theme:import` → `dialog.showOpenDialog`, read + `JSON.parse`, validate it has
    `name`/`base`/`tokens` and that token keys/values are sane, return the `CustomTheme`.
- **Preload** — add `theme.export(theme)` / `theme.import()` to the bridge, mirroring the
  existing `storage.backup` / `storage.restore` shape (`preload/index.ts:126–129`).
- **Renderer** — an "Export" button on each theme card and an "Import theme" button in
  the Appearance pane; import adds the result via `addTheme` (regenerating `id` to avoid
  collisions, keeping the name).

File format = the `CustomTheme` object as JSON. Human-readable, diffable, trivially
shareable. `.deskmailtheme` is just a `.json` with a friendly extension for the dialog
filter.

### Validation (trust boundary — don't skip)
An imported file is untrusted input. Validate before applying: object shape, `base` is
`light|dark`, every token key is in the known `ThemeTokenKey` set, every value matches a
CSS-colour pattern (or is dropped). Reject anything else with a clear message. Cheap, and
it stops a malformed/hostile file injecting arbitrary CSS var values.

---

## Build phases (suggested order)

1. **Data model** — extend `LayoutPreferences` (`customThemes`, `activeThemeId`), add
   `CustomTheme` / `ThemeTokenKey` types and `THEME_TOKEN_GROUPS` metadata in
   `shared/layout.ts`. Update `DEFAULT_LAYOUT`. *Merge-over-defaults means no migration
   needed.* Add unit tests for the pure helpers (resolve tokens over base, validate
   import).
2. **Runtime apply** — `applyTheme` / `clearCustomVars` helper; wire into `hydrate` and
   `setActiveTheme`. Verify light/dark still works unchanged.
3. **Store actions** — `add/update/delete/duplicate/setActiveTheme` in `layoutStore`,
   each persisting.
4. **Editor UI** — `ThemeEditor.tsx` with grouped swatches, native picker, click-region
   selection, live preview, contrast readout.
5. **Appearance integration** — theme cards + create/edit/delete/duplicate buttons in the
   Appearance pane; upgrade the light/dark toggle to a scheme dropdown.
6. **Export / import** — IPC handlers, preload bridge, buttons, import validation.
7. **Polish** — reduced-motion respected (already global), keyboard focus on the editor,
   an "About these colours" hint, and confirm delete.

Phases 1–3 are the load-bearing core and are genuinely small. 4 is the bulk of the visible
work. 6 is a thin wrapper over patterns that already exist.

---

## Decisions to confirm before building

- **Overrides vs. full sets per theme** — plan assumes *overrides* (inherit base for
  untouched tokens). Confirm you're happy that a future default-palette improvement flows
  into your mostly-default custom themes. (Alternative: freeze full sets at save time.)
- **Editable token count** — plan hides `*-soft` and `shadow` as derived (17 swatches).
  Confirm you don't want to hand-tune shadows.
- **Where the switcher lives** — Appearance pane always; also upgrade the title-bar toggle
  to a dropdown? (Recommended yes — that's where you switch light/dark today.)
- **Per-account accent** — IMPROVEMENTS.md also lists "per-account colour accents" and a
  standalone "accent-colour picker". The accent picker is a *strict subset* of this editor
  (one token). Worth deciding if the small accent picker ships first as a stepping stone,
  or is simply absorbed by shipping this.

---

## Deliberately out of scope (YAGNI)

- **No theme marketplace / gallery / cloud sync** — export/import a file covers sharing.
- **No colour-picker dependency** — native `<input type="color">` + hex field.
- **No live-editable shadows or soft-tints** — derived from primaries.
- **No per-component overrides** — the 17 tokens theme the whole app by design; going
  finer-grained is a different, much larger feature and there's no stated need.
- **No gradient / image backgrounds** — solid tokens only, matching the current design
  language and keeping contrast/readability predictable.

---

## One-line summary for the backlog

> Theme editor is **[med], not [big]**: the app is already 100% CSS-variable-driven and
> settings already merge-over-defaults and ride in backups — so it's one editor screen,
> ~2 new settings fields, one `applyTheme` function, and a thin export/import pair, with
> the "remembers across updates" and "backs up with your data" requirements already met by
> existing infrastructure.
