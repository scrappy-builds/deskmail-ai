import { defineConfig } from '@playwright/test'

// Electron is launched directly inside each test via _electron.launch, so no
// browser projects are needed here.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']]
})
