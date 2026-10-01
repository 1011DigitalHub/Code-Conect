// WCAG 2.0, 2.1 and 2.2 at levels A and AA: the conformance target of the project.
// Shared by the component suite (Vitest) and the browser suite (Playwright, e2e/).
export const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

type Violation = {
  id: string
  impact?: string | null
  help: string
  nodes: { target: unknown[] }[]
}

// One readable line per violation, followed by the offending selectors.
export function formatViolations(violations: Violation[]) {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `  - ${node.target.join(' ')}`).join('\n'),
  )
}
