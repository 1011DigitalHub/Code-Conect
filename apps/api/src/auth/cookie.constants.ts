import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

type SameSite = 'strict' | 'lax' | 'none';

// Secure is off by default outside production, on purpose: Chrome and
// Firefox treat http://localhost as potentially trustworthy and accept a
// Secure cookie there, but Safari does not, and neither does supertest's
// cookie jar (superagent builds `new CookieAccessInfo(host, path, isHttps)`
// and cookiejar refuses to replay a Secure cookie when isHttps is false) —
// so a Secure cookie in dev/test would make every e2e login silently never
// send the cookie back. It is called explicitly so it's testable per call,
// not captured once at module load.
export function isCookieSecure(): boolean {
  const configured = process.env.COOKIE_SECURE;
  if (configured) return configured === 'true';
  return process.env.NODE_ENV === 'production';
}

export function getCookieSameSite(): SameSite {
  const configured = process.env.COOKIE_SAMESITE?.toLowerCase();
  if (configured === 'lax' || configured === 'none') return configured;
  return 'strict';
}

function getCookieDomain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined;
}

// Shared by both cookies so they can never attribute-drift from each other.
function baseCookieOptions(): Pick<
  CookieOptions,
  'secure' | 'sameSite' | 'path' | 'domain'
> {
  return {
    secure: isCookieSecure(),
    sameSite: getCookieSameSite(),
    // Path must be explicit: without it, Express/the browser scope the
    // cookie to the path of the response that set it (e.g. /auth), and a
    // route outside /auth would never receive it.
    path: '/',
    domain: getCookieDomain(),
  };
}

// `remember`: true keeps the cookie across a browser restart (Max-Age set to
// the token's lifetime in ms); false makes it a session cookie that the
// browser discards when it closes. The access-token cookie's lifetime must
// match the JWT's own expiry, or a cookie that outlives its token produces a
// "logged in, but every request 401s" loop.
export function getSessionCookieOptions(
  remember: boolean,
  maxAgeSeconds: number,
): CookieOptions {
  return {
    ...baseCookieOptions(),
    httpOnly: true,
    ...(remember ? { maxAge: maxAgeSeconds * 1000 } : {}),
  };
}

// The CSRF cookie must be readable by the page's JS, so no httpOnly.
export function getCsrfCookieOptions(
  remember: boolean,
  maxAgeSeconds: number,
): CookieOptions {
  return {
    ...baseCookieOptions(),
    httpOnly: false,
    ...(remember ? { maxAge: maxAgeSeconds * 1000 } : {}),
  };
}

// res.clearCookie must be called with the same path/domain used to set the
// cookie, or the browser keeps the original one alive under the old attrs.
export function getClearCookieOptions(): CookieOptions {
  return baseCookieOptions();
}
