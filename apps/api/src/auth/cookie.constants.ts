import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
// Carries { state, codeVerifier, provider } (JSON) between GET
// /auth/oidc/:provider/start and its callback. httpOnly like access_token —
// but unlike linking_token below, it was NOT signed until round 8 of
// plan/LoginSocial.md's review: httpOnly only stops page JS and a cross-site
// XHR from touching it, not a sibling subdomain's own Set-Cookie response
// when COOKIE_DOMAIN is a shared parent domain. That sibling can still set
// this exact cookie name/domain/path to a self-consistent
// {provider, state, codeVerifier} it chose itself, then lure the victim into
// a provider authorization URL whose state/code_challenge match it — a
// login-CSRF the old "tampering grants nothing" reasoning didn't account
// for, since the attacker isn't tampering with a legitimate payload, they're
// supplying a whole valid-looking one of their own. See
// auth/oidc/oidc-flow-cookie.ts, now signed the same way linking_token is.
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

// oidc_flow is forced to SameSite=Lax regardless of COOKIE_SAMESITE: it
// must survive the top-level, cross-site redirect back from the provider's
// own domain (a Strict cookie would not be sent on that navigation). Lax
// still only sends the cookie on a top-level GET navigation, which is
// exactly what this is.
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

// Deliberately NOT forced to Lax like oidc_flow above: linking_token is set
// by the same callback redirect, but read back on a same-origin-to-the-API
// XHR POST (/auth/oidc/link) from the web app's page, not a top-level
// navigation. If the web app and the API are deployed on different
// registrable domains (COOKIE_SAMESITE=none, see security-standards.md),
// that XHR is itself cross-site — a cookie hardcoded to Lax would never be
// sent on it, and linking would always 401 with "missing token" in exactly
// that deployment shape. Respecting the configured COOKIE_SAMESITE (via
// baseCookieOptions, the same as the session/CSRF cookies) is what makes
// this work in both the same-site and cross-site cases.
export function getLinkingTokenCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    httpOnly: true,
    maxAge: OIDC_COOKIE_MAX_AGE_MS,
  };
}

// Mirrors the SameSite=Lax override above: clearing oidc_flow with the
// default (COOKIE_SAMESITE-derived) attributes wouldn't reliably match the
// cookie that was set with Lax. linking_token doesn't need this — it was
// never forced to Lax, so the existing getClearCookieOptions() (same
// configurable attributes baseCookieOptions already gives every other
// cookie) already matches it.
export function getClearOidcFlowCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
  };
}
