import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { WCAG_AA_TAGS, formatViolations } from '../src/test/wcag.ts'

// /perfil is private, so it is not in routes.ts (SEO and Lighthouse only cover public
// routes). Here it gets the same accessibility checks, with a fake session and a fake API.
const TOKEN_KEY = 'code-connect.access-token'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
}

async function openProfile(page: Page) {
  await page.addInitScript(
    ([key]) => sessionStorage.setItem(key, 'fake-jwt'),
    [TOKEN_KEY],
  )
  // Stands in for GET /auth/me (and its CORS preflight): the API does not need to run.
  await page.route('**/auth/me', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders })
    }
    return route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        createdAt: '2026-10-02T12:00:00.000Z',
        links: { self: '/users/1' },
      }),
    })
  })
  await page.goto('/perfil')
  await page.getByText('Ana Souza').waitFor()
}

test.describe('Perfil (/perfil)', () => {
  test('has no WCAG 2.2 AA violations', async ({ page }) => {
    await openProfile(page)

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

    const report = formatViolations(results.violations)
    expect(report, report.join('\n')).toEqual([])
  })

  test('reflows without horizontal scrolling', async ({ page }) => {
    await openProfile(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0)
  })

  test('has a title that describes the page', async ({ page }) => {
    await openProfile(page)

    await expect(page).toHaveTitle('Perfil | Code Connect')
  })

  test('reaches the sign-out button with Tab and shows a visible focus', async ({ page }) => {
    await openProfile(page)

    await page.keyboard.press('Tab')

    const button = page.getByRole('button', { name: 'Sair' })
    await expect(button).toBeFocused()
    const outlineWidth = await button.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))
    expect(outlineWidth).toBeGreaterThan(0)
  })

  test('sends visitors without a session to the login page', async ({ page }) => {
    await page.goto('/perfil')

    await expect(page).toHaveURL(/\/login$/)
  })
})
