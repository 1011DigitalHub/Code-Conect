import { expect, test } from '@playwright/test'
import { routes } from './routes.ts'

// Security headers served by `vite preview` (see vite.config.ts's
// `preview.headers`) — the same headers a real deployment's reverse
// proxy/CDN must send (CLAUDE.md). Lighthouse's Best Practices score does
// not catch a missing or broken CSP (the CSP-XSS audit is informational,
// not scored), so this suite is the only automated guard for it.
for (const route of routes) {
  test.describe(`${route.name} (${route.path}) security headers`, () => {
    test('serves the expected security headers', async ({ page }) => {
      const response = await page.goto(route.path)
      const headers = response?.headers() ?? {}

      const csp = headers['content-security-policy'] ?? ''
      const directives = Object.fromEntries(
        csp.split(';').map((d) => {
          const [name, ...values] = d.trim().split(' ')
          return [name, values]
        }),
      )

      expect(directives['default-src']).toContain("'self'")
      expect(directives['object-src']).toContain("'none'")
      expect(directives['frame-ancestors']).toContain("'none'")
      expect(directives['base-uri']).toContain("'self'")
      // script-src is what actually matters for XSS, and this app has no
      // inline <script>, so it stays strict with no escape hatch.
      // style-src does allow 'unsafe-inline' (see vite.config.ts) — a test
      // tooling need (WCAG 1.4.12's page.addStyleTag), not a feature one.
      expect(directives['script-src']).not.toContain("'unsafe-inline'")
      expect(headers['strict-transport-security']).toBeTruthy()
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['referrer-policy']).toBeTruthy()
      expect(headers['cross-origin-opener-policy']).toBeTruthy()
    })

    test('renders correctly under the CSP, with no console errors', async ({ page }) => {
      const consoleErrors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('pageerror', (error) => consoleErrors.push(error.message))

      await page.goto(route.path)
      await page.getByRole('heading', { level: 1 }).waitFor()

      expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
    })
  })
}
