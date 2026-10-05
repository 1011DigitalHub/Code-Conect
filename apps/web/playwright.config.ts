import { defineConfig, devices } from '@playwright/test'

const host = '127.0.0.1'
const port = 5174
const apiPort = 3000

// Browser accessibility suite: checks that need real layout and rendering (contrast,
// target size, reflow, visible focus). Component-level checks live in the Vitest suite.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // One browser at a time: parallel Chromium instances hang on this Windows setup.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://${host}:${port}`,
    // New headless mode: the old headless shell stops answering Tab key events on Windows.
    channel: 'chromium',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    // 320 CSS px is the WCAG 1.4.10 (Reflow) reference width.
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } } },
  ],
  webServer: [
    {
      // Production build: what users get, and much lighter than the dev server under parallel load.
      command: `pnpm exec vite build && pnpm exec vite preview --host ${host} --port ${port} --strictPort`,
      url: `http://${host}:${port}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // "/" is now the public feed, which fetches real posts, so the a11y,
      // SEO and Lighthouse suites need a real API behind it — auditing an
      // empty or error state would not measure the page this project ships.
      // Needs `pnpm db:up && pnpm db:migrate && pnpm db:seed` run first; this
      // only starts the already-migrated, already-seeded API.
      command: process.env.CI ? 'pnpm build && pnpm start:prod' : 'pnpm start:dev',
      cwd: '../api',
      url: `http://localhost:${apiPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
