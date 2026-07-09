import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Shared alias so every process can import from src/shared with @shared.
const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
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
