# Customising DeskMail with Claude

The best thing about DeskMail is that you can change it yourself by **asking Claude** —
even if you don't write code. This guide shows you how, with real examples.

## What you need

- The DeskMail source code on your computer (see the [README](../README.md) Quick start).
- **Claude Code** (in a terminal) or the **Claude Desktop** app opened on this folder.

When you open this folder with Claude, it reads [`CLAUDE.md`](../CLAUDE.md) first, which
tells it how the app is built — so it already knows its way around.

## The basic loop

1. **Tell Claude what you want**, in your own words.
2. Claude finds the right file and makes the change.
3. **See it working:** run `npm run dev` (Claude can do this for you) and the app opens
   with your change.
4. If it's not quite right, say so — "make it a bit darker", "no, the other button".

You don't need to know which file anything lives in. That's Claude's job.

---

## Worked examples

Each one shows *what to type to Claude* and *roughly what happens*.

### 1. Change the colours / make a dark-blue theme

> **You:** "Change DeskMail's default theme to a dark blue instead of light blue."

Claude edits the accent colours in `src/renderer/styles.css` and
`src/shared/theme.ts` (they're kept in step), then runs the app so you can see it. Ask
for tweaks: "a bit less purple", "make the buttons brighter". You can also do this live,
without code, in **Settings → Appearance** — but asking Claude changes the *default* for
good.

### 2. Add a keyboard shortcut to archive

> **You:** "Add a keyboard shortcut so pressing E archives the selected email."

Claude adds the binding to the shortcut config and the handler in `src/renderer/App.tsx`.
Shortcuts also have an on/off switch and a remap screen in **Settings → Shortcuts** —
Claude can change the defaults there too.

### 3. Change how the reading pane looks

> **You:** "Make the reading pane show the sender's email address under their name, and
> use a slightly bigger font for the message body."

Claude finds the reading-pane component (`src/renderer/regions/`), makes the change, and
opens the app so you can check it reads well.

### 4. Draft replies in your writing style

> **You:** "When I ask you to draft a reply, write it in my voice: short sentences,
> friendly, British spelling, no corporate jargon."

This one isn't a code change at all — it's how you talk to Claude through the **Claude
connector**. Claude reads the email, writes a draft in your style, and puts it in
DeskMail's **Drafts** for you to check and send. (It never sends on its own.)

### 5. Have Claude set up your email account

> **You (in Claude Desktop):** "Set up my Gmail account in DeskMail."

Claude looks up Gmail's settings, fills in the whole Add-account form in the app, and
tells you to type your password, run the test, and save. **It never sees your password.**
If your provider needs an "app password", Claude tells you and where to get one.

---

## Tips

- **Small steps win.** Ask for one change, see it, then ask for the next.
- **You can always undo.** Changes are in code you can revert; and if you use Git, Claude
  can undo a change for you ("undo that last change").
- **If something breaks**, paste the error to Claude and ask it to fix it. Run
  `npm test` (or ask Claude to) to check nothing else broke.
- **Keep backups** of your mail (Settings → Local storage → Backup) before big
  experiments.

That's it — DeskMail is yours to shape. If you can describe it, Claude can usually build
it.
