import { join } from 'node:path'

export interface DataDirResult {
  dir: string | null // null → use the OS default userData location
  portable: boolean
}

export interface ResolveOpts {
  argv: string[]
  env: NodeJS.ProcessEnv
  exeDir: string
  exists: (p: string) => boolean
}

// Decide where DeskMail's data lives. Precedence:
//   1. DESKMAIL_USER_DATA env (tests / explicit override)
//   2. --portable [dir]  (USB mode; explicit dir, else <exeDir>/data)
//   3. a portable marker next to the executable (portable.txt or a data/ folder)
//   4. otherwise null → the OS app-data location
export function resolveDataDir(o: ResolveOpts): DataDirResult {
  if (o.env.DESKMAIL_USER_DATA) return { dir: o.env.DESKMAIL_USER_DATA, portable: false }

  const pIdx = o.argv.indexOf('--portable')
  if (pIdx >= 0) {
    const next = o.argv[pIdx + 1]
    const dir = next && !next.startsWith('--') ? next : join(o.exeDir, 'data')
    return { dir, portable: true }
  }

  if (o.exists(join(o.exeDir, 'portable.txt')) || o.exists(join(o.exeDir, 'data'))) {
    return { dir: join(o.exeDir, 'data'), portable: true }
  }

  return { dir: null, portable: false }
}
