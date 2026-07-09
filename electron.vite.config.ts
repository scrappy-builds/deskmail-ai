import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Shared alias so every process can import from src/shared with @shared.
const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer')
}

export default defineConfig({
  main: {
    // Externalise node deps (node-sqlite3-wasm, imapflow, nodemailer) so they load
    // from node_modules at runtime instead of being bundled.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Standalone local MCP server (launched by Claude Desktop, not Electron).
          'mcp-server': resolve('src/mcp/server.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          // Independent message windows load their own entry (own preload, no Node).
          message: resolve('src/renderer/message.html')
        }
      }
    }
  }
})
