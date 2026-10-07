import { api } from './client'

const CSRF_COOKIE_NAME = 'csrf_token'

// The csrf_token cookie is deliberately not httpOnly (see the API's
// cookie.constants.ts), so the page reads it straight from document.cookie —
// no dependency needed for one line of parsing.
export function readCsrfCookie(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`))
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : undefined
}

// Forgets the locally held cookie, so the next ensureCsrfToken() call
// fetches a fresh one. Used after a 403 proves the current token is stale
// (e.g. rotated by a login that happened in another tab).
export function resetCsrfToken(): void {
  document.cookie = `${CSRF_COOKIE_NAME}=; Max-Age=0; path=/`
}

let bootstrap: Promise<string | undefined> | null = null

// Fetches a fresh csrf_token cookie when none is set yet (first visit, or
// right after resetCsrfToken()). Memoized so two concurrent callers — e.g.
// two mutations fired at once — trigger exactly one GET /auth/csrf.
export function ensureCsrfToken(): Promise<string | undefined> {
  const existing = readCsrfCookie()
  if (existing) return Promise.resolve(existing)

  bootstrap ??= api
    .get('/auth/csrf')
    .then(() => readCsrfCookie())
    .finally(() => {
      bootstrap = null
    })
  return bootstrap
}
