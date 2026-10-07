import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { WCAG_AA_TAGS, formatViolations } from '../src/test/wcag.ts'

// /perfil is private, so it is not in routes.ts (SEO and Lighthouse only cover public
// routes). Here it gets the same accessibility checks, with a fake session and a fake API.
//
// The session is an httpOnly cookie now, invisible to page JS, so it can
// only be seeded through the browser context (addCookies), never through
// page.addInitScript + storage the way the old Bearer token was. The origin
// below must be the exact preview origin, not '*': the client now sends
// withCredentials: true, and a browser refuses a credentialed response
// whose Access-Control-Allow-Origin is a wildcard.
const PREVIEW_ORIGIN = 'http://127.0.0.1:5174'

const corsHeaders = {
  'access-control-allow-origin': PREVIEW_ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-csrf-token',
}

async function seedSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'access_token',
      value: 'fake-jwt',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    },
  ])
}

function routeMe(page: Page, body: unknown, status = 200) {
  return page.route('**/auth/me', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders })
    }
    return route.fulfill({
      status,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

async function openProfile(page: Page) {
  // Decorative here (the route below fakes the API, so the cookie is never
  // actually read), but documents the real shape and is what you'd use
  // against a live API.
  await seedSession(page)
  await routeMe(page, {
    id: 1,
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    createdAt: '2026-10-02T12:00:00.000Z',
    links: { self: '/users/1' },
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
    // There is no readable token to short-circuit on anymore: the page
    // always probes GET /auth/me, so this needs an explicit 401 route —
    // without it the request would hit the real network (no API runs
    // alongside this preview server) and fail as a connection error, not
    // a 401, and the page would show the generic error instead of
    // redirecting.
    await routeMe(page, {}, 401)

    await page.goto('/perfil')

    await expect(page).toHaveURL(/\/login$/)
  })
})
