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
      // The build itself runs beforehand (see the "test:a11y" script), and this calls vite's own
      // bin script through `node` directly instead of `pnpm exec vite` — on CI, tree-killing a
      // `pnpm exec` invocation after the suite finishes didn't reliably reach the preview server
      // underneath its pnpm/sh wrapper processes, leaving it (and the job) stuck until the runner
      // timeout. A single `node <script>` process has nothing to not reach.
      command: `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
      url: `http://${host}:${port}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // "/" is now the public feed, which fetches real posts, so the a11y,
      // SEO and Lighthouse suites need a real API behind it — auditing an
      // empty or error state would not measure the page this project ships.
      // Needs `pnpm db:up && pnpm db:migrate && pnpm db:seed` run first; this
      // only starts the already-migrated, already-seeded API.
      //
      // On CI this is `node dist/main.js`, not `pnpm start:prod`, and the build
      // is a separate CI step rather than being chained in here — for exactly
      // the reason the preview server above stopped going through `pnpm exec`.
      // Playwright's teardown tree-kill does not reliably reach a node process
      // buried under pnpm/sh wrappers: every test passed and the job then hung
      // in teardown until the runner timeout, with pnpm/sh/node left as orphans.
      command: process.env.CI ? 'node dist/main.js' : 'pnpm start:dev',
      cwd: '../api',
      url: `http://localhost:${apiPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // src/env.ts validates NODE_ENV at boot and refuses to start without it.
      // It is set here, on the API process alone, rather than on the CI job:
      // `vite build` reads NODE_ENV too, and a job-level value bundles React's
      // development build (576 kB instead of 347 kB).
      env: { NODE_ENV: 'test' },
    },
  ],
})
