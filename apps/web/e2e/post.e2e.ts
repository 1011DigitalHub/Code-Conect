import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { WCAG_AA_TAGS, formatViolations } from '../src/test/wcag.ts'

// A post page is not in routes.ts (so a11y.e2e.ts and seo.e2e.ts don't cover
// it): its title is the post's own title, not a fixed route name, which
// would make the `^<Name>\b.*Code Connect` regex those suites use either
// brittle or meaningless. It gets the same accessibility checks here, with a
// mocked API, mirroring profile.e2e.ts.
const PREVIEW_ORIGIN = 'http://127.0.0.1:5174'
// The API's own origin (the client's DEFAULT_API_URL; VITE_API_URL is unset
// in this preview). Every mock below matches on `url.origin` as well as the
// path: the web app has a client-side route at this exact same path
// ('/posts/:slug'), so page.goto('/posts/<slug>') is itself a navigation
// request, and a path-only matcher would also catch it — serving the
// mocked JSON as the page's own HTML document instead of the API response.
const API_ORIGIN = 'http://localhost:3000'
const SLUG = 'componentes-react-na-pratica'
const TITLE = 'Componentes React na prática'

const corsHeaders = {
  'access-control-allow-origin': PREVIEW_ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-csrf-token',
}

function post() {
  return {
    slug: SLUG,
    title: TITLE,
    content: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
    excerpt:
      'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade.',
    thumbnailUrl: null,
    createdAt: '2026-10-04T12:00:00.000Z',
    author: { id: 1, name: 'Ana Souza', self: '/users/1' },
    likeCount: 4,
    commentCount: 1,
    likedByMe: false,
    links: {
      self: `/posts/${SLUG}`,
      comments: `/posts/${SLUG}/comments`,
      like: `/posts/${SLUG}/like`,
      author: '/users/1',
    },
  }
}

function comments() {
  return {
    data: [
      {
        id: 1,
        body: 'Muito bom, obrigado por compartilhar!',
        createdAt: '2026-10-05T10:00:00.000Z',
        author: { id: 2, name: 'Bruno Lima', self: '/users/2' },
        links: { self: `/posts/${SLUG}/comments/1`, post: `/posts/${SLUG}` },
      },
    ],
    pagination: { page: 1, perPage: 9, total: 1, totalPages: 1 },
    links: { self: `/posts/${SLUG}/comments?page=1`, next: null, prev: null },
  }
}

// Matches on the parsed URL's origin and pathname rather than a glob or
// regex string: both of those need careful escaping (a literal "?" in a
// glob is a single-character wildcard; in a regex built from a template
// string, "\?" loses its backslash under ordinary JS string-escaping rules
// before the regex engine ever sees it). Comparing URL properties directly
// has no escaping pitfalls and is exact by construction.
function apiPath(pathname: string): (url: URL) => boolean {
  return (url) => url.origin === API_ORIGIN && url.pathname === pathname
}

// Fulfills both the CORS preflight (every request axios sends carries a
// Content-Type header, even on GET, which makes it a non-simple request) and
// the real method with the given body.
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

async function seedSession(page: Page) {
  // Both cookies up front: csrf_token is readable by JS (not httpOnly), so
  // ensureCsrfToken() finds it already set and never needs to hit
  // GET /auth/csrf at all.
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

async function mockPost(page: Page) {
  await jsonRoute(page, apiPath(`/posts/${SLUG}`), post())
  await jsonRoute(page, apiPath(`/posts/${SLUG}/comments`), comments())
  await jsonRoute(page, apiPath(`/posts/${SLUG}/like`), undefined, 204)
}

async function openAsVisitor(page: Page) {
  await jsonRoute(page, apiPath('/auth/me'), {}, 401)
  await mockPost(page)
  await page.goto(`/posts/${SLUG}`)
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
}

async function openAsMember(page: Page) {
  await seedSession(page)
  await jsonRoute(page, apiPath('/auth/me'), {
    id: 2,
    name: 'Bruno Lima',
    email: 'bruno@exemplo.com',
    createdAt: '2026-10-02T12:00:00.000Z',
    links: { self: '/users/2' },
  })
  await mockPost(page)
  await page.goto(`/posts/${SLUG}`)
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
}

test.describe(`Post (/posts/${SLUG})`, () => {
  test('has no WCAG 2.2 AA violations, signed out', async ({ page }) => {
    await openAsVisitor(page)

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

    const report = formatViolations(results.violations)
    expect(report, report.join('\n')).toEqual([])
  })

  test('has no WCAG 2.2 AA violations, signed in', async ({ page }) => {
    await openAsMember(page)

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

    const report = formatViolations(results.violations)
    expect(report, report.join('\n')).toEqual([])
  })

  test('reflows without horizontal scrolling', async ({ page }) => {
    await openAsVisitor(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0)
  })

  test('titles the page after the post, not a fixed route name', async ({ page }) => {
    await openAsVisitor(page)

    await expect(page).toHaveTitle(`${TITLE} | Code Connect`)
  })

  test('offers a login link instead of a like button or comment form when signed out', async ({
    page,
  }) => {
    await openAsVisitor(page)

    await expect(page.getByRole('link', { name: /Entre para curtir/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Entre para comentar' })).toBeVisible()
    await expect(page.getByLabel('Seu comentário')).toHaveCount(0)
  })

  test('toggles the like and shows the comment form when signed in', async ({ page }) => {
    await openAsMember(page)

    // Matched on the title alone, not the verb: the accessible name's verb
    // flips between "Curtir" and "Remover a curtida" with the liked state,
    // so a locator pinned to "Curtir" would stop finding the button the
    // moment the click it's about to perform succeeds.
    const like = page.getByRole('button', { name: new RegExp(TITLE) })
    await expect(like).toHaveAttribute('aria-pressed', 'false')

    await like.click()
    await expect(like).toHaveAttribute('aria-pressed', 'true')

    await expect(page.getByLabel('Seu comentário')).toBeVisible()
  })

  // Deliberately never asserts on the visible relative-time text ("há 2
  // dias"), which changes with the real clock and would make this suite
  // flaky.
})
