import { defineConfig, devices } from '@playwright/test'

const host = '127.0.0.1'
const port = 5174

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
  webServer: {
    // Production build: what users get, and much lighter than the dev server under parallel load.
    command: `pnpm exec vite build && pnpm exec vite preview --host ${host} --port ${port} --strictPort`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
