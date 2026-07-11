# Contributing

Thanks for your interest. This is a **personal, non-commercial project** maintained on a
best-effort basis, so please read this before opening a pull request.

## Ground rules

- **The principles are non-negotiable.** DeskMail is local-only, single-user, no
  telemetry, no accounts. The Claude/MCP connector must stay **read-and-draft only** —
  it must never gain the ability to send mail, permanently delete, or read credentials.
  Changes that break these will not be merged.
- **Keep the licence in mind.** The project is under
  [PolyForm Noncommercial 1.0.0](LICENSE). By contributing you agree your contribution
  can be distributed under it.

## Practical

- **Open an issue first** for anything non-trivial, so we can agree on the approach
  before you spend time on it.
- **Run the tests** before opening a PR:
  ```bash
  npm test            # unit tests
  npm run typecheck   # TypeScript, both projects
  npm run test:e2e    # end-to-end (optional but appreciated)
  ```
- **Match the surrounding code.** Follow the existing style, naming, and comment density
  rather than introducing new patterns. See [CLAUDE.md](CLAUDE.md) for the architecture
  and house style.
- **Small, focused PRs** with a clear description are much easier to accept than large
  ones. New behaviour should come with a test.

PRs are welcome but **not guaranteed to be merged** — this is one person's project and
the roadmap is theirs. If your change isn't accepted, you're free to keep it in your own
fork (that's what the licence is for).
