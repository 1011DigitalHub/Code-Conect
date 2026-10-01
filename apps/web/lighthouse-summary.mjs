// Prints a Markdown table of the representative Lighthouse CI run per URL
// (scores plus LCP, CLS and TBT). Used for the GitHub Actions job summary.
import { readFileSync } from 'node:fs'

const dir = '.lighthouseci/reports'
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))

const score = (value) => (value == null ? '-' : Math.round(value * 100))
const lines = [
  '## Lighthouse (desktop, production build)',
  '',
  '| Route | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |',
  '|---|---|---|---|---|---|---|---|',
]

for (const run of manifest.filter((entry) => entry.isRepresentativeRun)) {
  const report = JSON.parse(readFileSync(run.jsonPath, 'utf8'))
  const audit = (id) => report.audits[id]?.displayValue ?? '-'
  const { pathname } = new URL(run.url)
  const s = run.summary
  lines.push(
    `| ${pathname} | ${score(s.performance)} | ${score(s.accessibility)} | ` +
      `${score(s['best-practices'])} | ${score(s.seo)} | ${audit('largest-contentful-paint')} | ` +
      `${audit('cumulative-layout-shift')} | ${audit('total-blocking-time')} |`,
  )
}

console.log(lines.join('\n'))
