import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      // Unit tests must not load the real electron binary (needs
      // node_modules/electron/dist, absent in CI / fresh clones). Tests that need
      // specific behaviour still vi.mock('electron') themselves.
      electron: resolve('tests/stubs/electron.ts')
    }
  },
  test: {
    // Unit tests only; Playwright E2E runs separately via `npm run test:e2e`.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
})
