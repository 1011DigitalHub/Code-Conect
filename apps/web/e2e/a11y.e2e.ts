import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { WCAG_AA_TAGS, formatViolations } from '../src/test/wcag.ts'
import { routes } from './routes.ts'

// WCAG 1.4.12 Text Spacing: the user overrides these values and nothing may be cut off.
const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`

for (const route of routes) {
  test.describe(`${route.name} (${route.path})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route.path)
      await page.getByRole('heading', { level: 1 }).waitFor()
    })

    test('has no WCAG 2.2 AA violations', async ({ page }) => {
      const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

      const report = formatViolations(results.violations)
      expect(report, report.join('\n')).toEqual([])
    })

    // WCAG 1.4.10 Reflow: content fits the viewport width without horizontal scrolling.
    test('reflows without horizontal scrolling', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0)
    })

    // WCAG 2.4.2 Page Titled: each page has its own title naming the page and the site.
    test('has a title that describes the page', async ({ page }) => {
      await expect(page).toHaveTitle(new RegExp(`^${route.name}\\b.*Code Connect`))
    })

    test('keeps text visible with increased text spacing', async ({ page }) => {
      await page.addStyleTag({ content: TEXT_SPACING_CSS })

      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => {
            const style = getComputedStyle(el)
            const hidesOverflow = [style.overflowX, style.overflowY].some((v) => v !== 'visible')
            const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())
            return (
              hidesOverflow &&
              hasText &&
              (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
            )
          })
          .map((el) => `${el.tagName.toLowerCase()} "${el.textContent?.trim()}"`),
      )
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(clipped, `text cut off: ${clipped.join(', ')}`).toEqual([])
      expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0)
    })

    // WCAG 2.1.1 Keyboard and 2.4.7 Focus Visible: every control is reachable with Tab
    // and shows a focus indicator.
    test('reaches every control with Tab and shows a visible focus', async ({ page }) => {
      const controls = await page
        .locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        .count()
      const withoutIndicator: string[] = []
      const reached = new Set<string>()

      for (let i = 0; i < controls; i++) {
        await page.keyboard.press('Tab')
        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return null
          const style = getComputedStyle(el)
          const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
          const hasRing = style.boxShadow !== 'none'
          const name =
            el.getAttribute('aria-label') ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.textContent?.trim() ||
            el.tagName.toLowerCase()
          return { name: `${el.tagName.toLowerCase()} "${name}"`, visible: hasOutline || hasRing }
        })
        if (!focused) break
        reached.add(focused.name)
        if (!focused.visible) withoutIndicator.push(focused.name)
      }

      expect(reached.size, 'controls reached with Tab').toBe(controls)
      expect(withoutIndicator, `no visible focus on: ${withoutIndicator.join(', ')}`).toEqual([])
    })
  })
}
