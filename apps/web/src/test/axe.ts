import axe from 'axe-core'
import { WCAG_AA_TAGS, formatViolations } from './wcag'

// jsdom has no layout or rendering, so checks that depend on them only run in the browser
// suite (e2e/): color contrast, target size and reflow.
const RULES_NEEDING_A_BROWSER = ['color-contrast', 'target-size']

// Runs axe on a rendered tree and fails with a readable list of WCAG AA violations.
export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: WCAG_AA_TAGS },
    rules: Object.fromEntries(RULES_NEEDING_A_BROWSER.map((id) => [id, { enabled: false }])),
  })

  const report = formatViolations(results.violations)
  expect(report, report.join('\n')).toEqual([])
}
