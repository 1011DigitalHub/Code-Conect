/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Mirrors client.ts's own default, since vite.config.ts runs in Node and
// can't read import.meta.env — connect-src needs the real API origin so a
// production build can actually reach it under this CSP.
const apiOrigin = process.env.VITE_API_URL ?? 'http://localhost:3000'

// Security headers for `vite preview` (production build), the server both
// Playwright and Lighthouse CI run against — the same headers a real
// deployment's reverse proxy/CDN must send (see CLAUDE.md). There is no
// inline <script> in index.html and no CSS-in-JS in this app, so script-src
// stays strict with no 'unsafe-inline' — that's the directive that actually
// matters for XSS. style-src allows 'unsafe-inline' only because the WCAG
// 1.4.12 (Text Spacing) Playwright test (e2e/a11y.e2e.ts) injects an
// override stylesheet via page.addStyleTag, which a strict style-src blocks
// outright; inline CSS has nowhere near the attack surface of inline JS, so
// this is the standard, lower-risk trade-off. e2e/security.e2e.ts asserts
// the page loads under this policy with zero console errors.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "img-src 'self' data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: SECURITY_HEADERS,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
