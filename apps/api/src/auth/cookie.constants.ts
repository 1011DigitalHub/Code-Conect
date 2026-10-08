import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
// Carries { state, codeVerifier, provider } (JSON) between GET
// /auth/oidc/:provider/start and its callback. httpOnly like access_token:
// nothing here needs to be read by page JS, and signing it on top would add
// nothing — tampering with it either fails our own state check or fails the
// provider's own PKCE check, it doesn't grant anything (see plan/LoginSocial.md).
export const OIDC_FLOW_COOKIE = 'oidc_flow';
// Carries the signed linking_token (see auth/oidc/oidc-linking-token.ts)
// between the callback and POST /auth/oidc/link. Unlike oidc_flow, this one
// IS signed — it's the one artifact that, if forged, would let someone link
// an OIDC identity to an email they don't control.
export const LINKING_TOKEN_COOKIE = 'linking_token';

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

// 5 minutes. Exported so oidc-flow-cookie.ts and oidc-linking-token.ts can
// embed the same lifetime as an explicit `exp` in the cookie's own payload,
// checked server-side — the Max-Age attribute alone only controls whether
// the *browser* still sends the cookie, which is not the same guarantee as
// the server itself refusing a stale one.
export const OIDC_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

// Both OIDC cookies are forced to SameSite=Lax regardless of COOKIE_SAMESITE:
// oidc_flow must survive the top-level, cross-site redirect back from the
// provider's own domain (a Strict cookie would not be sent on that
// navigation), and linking_token is set by that same redirect. Lax still
// only sends the cookie on a top-level GET navigation, which is exactly
// what both of these are.
export function getOidcFlowCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
    httpOnly: true,
    maxAge: OIDC_COOKIE_MAX_AGE_MS,
  };
}

export function getLinkingTokenCookieOptions(): CookieOptions {
  return getOidcFlowCookieOptions();
}

// Mirrors the SameSite=Lax override above: clearing with the default
// (COOKIE_SAMESITE-derived) attributes wouldn't reliably match the cookie
// that was set with Lax.
export function getClearOidcCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
  };
}
