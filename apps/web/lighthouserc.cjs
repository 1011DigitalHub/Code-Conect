// Lighthouse CI config (see .github/workflows/lighthouse.yml). Targets follow CLAUDE.md,
// "Performance and SEO (Lighthouse)".
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const host = '127.0.0.1'
const port = 5174

// Audit the same public routes as the browser suites, so e2e/routes.ts stays the only list.
const routesSource = readFileSync(join(__dirname, 'e2e', 'routes.ts'), 'utf8')
const paths = [...routesSource.matchAll(/path:\s*'([^']+)'/g)].map(([, path]) => path)
if (paths.length === 0) throw new Error('lighthouserc: no routes found in e2e/routes.ts')

// Base assertions applied to every audited URL.
const baseAssertions = {
  'categories:performance': ['error', { minScore: 0.9 }],
  'categories:accessibility': ['error', { minScore: 1 }],
  'categories:best-practices': ['error', { minScore: 1 }],
  'categories:seo': ['error', { minScore: 1 }],
  'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
  'total-blocking-time': ['error', { maxNumericValue: 200 }],
}

module.exports = {
  ci: {
    collect: {
      // Production build only: the dev server gives false bundle-size and LCP findings.
      startServerCommand: `pnpm exec vite preview --host ${host} --port ${port} --strictPort`,
      startServerReadyPattern: 'Local',
      url: paths.map((path) => `http://${host}:${port}${path}`),
      numberOfRuns: 3,
      settings: { preset: 'desktop' },
    },
    assert: {
      // assertMatrix and assertions cannot coexist; use assertMatrix exclusively.
      // The first entry covers all URLs; the second relaxes is-crawlable for the
      // 404 page, which intentionally carries <meta name="robots" content="noindex">.
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: baseAssertions,
        },
        {
          // The 404 page intentionally carries <meta name="robots" content="noindex">,
          // which makes is-crawlable and the whole SEO category irrelevant for this route.
          // Later entries override earlier ones for the same key in assertMatrix.
          matchingUrlPattern: 'essa-rota-nao-existe',
          assertions: {
            'categories:seo': 'off',
            'is-crawlable': 'off',
          },
        },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
}
