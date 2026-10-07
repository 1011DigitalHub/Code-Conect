import { expect, test, type Page } from '@playwright/test'

// Requirement 4.5 end to end: the side menu's Login/Sair link switches with
// the session, and signing out never bounces a visitor off the feed, which
// is public. Uses a mocked API, mirroring profile.e2e.ts, rather than the
// real one this suite's webServer also starts — a real backend is what lets
// a11y.e2e.ts and seo.e2e.ts measure the actual feed, but this file only
// needs to prove the session switch, which is faster and more reliable to
// do against a mock.
const PREVIEW_ORIGIN = 'http://127.0.0.1:5174'
// The API's own origin. Every matcher below checks `url.origin` as well as
// the path: '/' is also the web app's own client-side route (the feed), so
// a path-only matcher for "/posts" would be the only thing standing between
// a correctly scoped mock and one that risks matching across origins by
// accident. See the longer comment in post.e2e.ts for a case where that
// actually happened.
const API_ORIGIN = 'http://localhost:3000'

const corsHeaders = {
  'access-control-allow-origin': PREVIEW_ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-csrf-token',
}

// Matches on the parsed URL's origin and pathname — exact by construction,
// and immune to the escaping pitfalls of glob ("?" is a wildcard) or a regex
// built from a template string ("\?" loses its backslash under ordinary JS
// string-escaping before the regex engine ever sees it).
function apiPath(pathname: string): (url: URL) => boolean {
  return (url) => url.origin === API_ORIGIN && url.pathname === pathname
}

function jsonRoute(page: Page, matcher: (url: URL) => boolean, body: unknown, status = 200) {
  return page.route(matcher, (route) => {
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

const emptyFeed = {
  data: [],
  pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
  links: { self: '/posts?page=1', next: null, prev: null },
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
    {
      name: 'csrf_token',
      value: 'fake-csrf',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Strict',
    },
  ])
}

test.describe('Feed session switch', () => {
  test('shows Login in the side menu without a session', async ({ page }) => {
    await jsonRoute(page, apiPath('/auth/session'), { user: null })
    await jsonRoute(page, apiPath('/posts'), emptyFeed)

    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0)
  })

  test('shows Sair in the side menu with a session', async ({ page }) => {
    await seedSession(page)
    await jsonRoute(page, apiPath('/auth/session'), {
      user: {
        id: 1,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        createdAt: '2026-10-02T12:00:00.000Z',
        links: { self: '/users/1' },
      },
    })
    await jsonRoute(page, apiPath('/posts'), emptyFeed)

    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Login' })).toHaveCount(0)
  })

  test('signing out returns to Login and stays on the feed', async ({ page }) => {
    await seedSession(page)
    await jsonRoute(page, apiPath('/auth/session'), {
      user: {
        id: 1,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        createdAt: '2026-10-02T12:00:00.000Z',
        links: { self: '/users/1' },
      },
    })
    await jsonRoute(page, apiPath('/posts'), emptyFeed)
    await jsonRoute(page, apiPath('/auth/logout'), {}, 204)

    await page.goto('/')
    await page.getByRole('button', { name: 'Sair' }).click()

    // The feed is public, so signing out never redirects away from it.
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible()
  })
})
