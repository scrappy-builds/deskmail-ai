import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  test: {
    // Unit tests only; Playwright E2E runs separately via `npm run test:e2e`.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
})
