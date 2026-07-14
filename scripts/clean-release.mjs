// Runs as the `prepackage` step before electron-builder. Clears old installers so
// `release/` only ever holds the version about to be built — no stale .exe/.blockmap
// piling up. Node (not shell rm) so it works from npm's Windows cmd.exe too.
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'release')
let removed = 0
try {
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.exe') || f.endsWith('.exe.blockmap')) {
      rmSync(join(dir, f), { force: true })
      removed++
    }
  }
} catch {
  /* release/ doesn't exist yet (first build) — nothing to clean */
}
console.log(`clean-release: removed ${removed} old installer file(s)`)
