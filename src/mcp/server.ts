import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { openDatabase } from '../db/database'
import { buildTools } from './tools'

// Standalone local MCP server launched by Claude Desktop. It talks stdio and
// reads the same SQLite cache the app uses. It exposes ONLY the safe read/draft
// tools — there is no send, delete, credential, settings or filesystem access.

function resolveDbPath(): string {
  if (process.env.DESKMAIL_DB) return process.env.DESKMAIL_DB
  // Default to the Electron userData location for DeskMail on this platform.
  if (process.platform === 'win32' && process.env.APPDATA) return join(process.env.APPDATA, 'deskmail-ai', 'deskmail.db')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'deskmail-ai', 'deskmail.db')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'deskmail-ai', 'deskmail.db')
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath()
  const db = openDatabase(dbPath)
  const server = new McpServer({ name: 'deskmail-ai', version: '0.1.0' })

  for (const t of buildTools(db, { exportDir: dirname(dbPath) })) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema },
      async (args: Record<string, unknown>) => {
        const result = t.handler(args ?? {})
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      }
    )
  }

  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  // stderr only — stdout is the MCP transport.
  process.stderr.write(`DeskMail MCP server failed: ${(err as Error).message}\n`)
  process.exit(1)
})
