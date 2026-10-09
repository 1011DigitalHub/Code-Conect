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

// 5 minutes. Exported so oidc-flow-cookie.ts and oidc-linking-token.ts can
// embed the same lifetime as an explicit `exp` in the cookie's own payload,
// checked server-side — the Max-Age attribute alone only controls whether
// the *browser* still sends the cookie, which is not the same guarantee as
// the server itself refusing a stale one.
export const OIDC_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

// Round 9 of plan/LoginSocial.md's review: round 8 signed oidc_flow (HMAC)
// to stop a forged cookie, but that doesn't stop THIS cookie, legitimately
// signed by us. An attacker can run /start themselves, get back a real,
// validly-signed cookie bound to a flow they control, and inject that exact
// cookie into the victim via a sibling subdomain's own Set-Cookie response —
// viable whenever COOKIE_DOMAIN is a shared parent domain, since nothing
// stops a sibling's response from naming this same cookie + Domain. A
// browser-enforced `__Host-` prefix is the actual fix: it requires Secure
// and forbids a Domain attribute outright, on ANY origin's Set-Cookie for
// that exact name — so the sibling's injection attempt is host-only to
// *its own* origin and never reaches ours, no matter what Domain it tries to
// claim. Same reasoning applies to linking_token below (worse impact there —
// see its own comment). Only viable when Secure is actually on (browsers
// refuse `__Host-` without it) — gated on isCookieSecure(), the same check
// that already decides Secure, so dev/test (Secure off, see that function's
// comment on why) keeps the old plain name and respects COOKIE_DOMAIN, where
// there is no real sibling-subdomain threat to begin with.
function useHostPrefix(): boolean {
  return isCookieSecure();
}

export function getOidcFlowCookieName(): string {
  return useHostPrefix() ? '__Host-oidc_flow' : 'oidc_flow';
}

// Neither this nor oidc_flow ever needs COOKIE_DOMAIN: both are httpOnly,
// set by the API for the API, on requests that always land on the API's own
// origin — unlike csrf_token, which is deliberately readable cross-subdomain
// by the web app's own JS. Omitting `domain` here isn't just required by
// `__Host-`, it was never doing anything useful for these two to begin with.
export function getOidcFlowCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    // oidc_flow is forced to SameSite=Lax regardless of COOKIE_SAMESITE: it
    // must survive the top-level, cross-site redirect back from the
    // provider's own domain (a Strict cookie would not be sent on that
    // navigation). Lax still only sends the cookie on a top-level GET
    // navigation, which is exactly what this is.
    sameSite: 'lax',
    path: '/',
    ...(useHostPrefix() ? {} : { domain: getCookieDomain() }),
    httpOnly: true,
    maxAge: OIDC_COOKIE_MAX_AGE_MS,
  };
}

// Carries the signed linking_token (see auth/oidc/oidc-linking-token.ts)
// between the callback and POST /auth/oidc/link. This one is worse than
// oidc_flow if a sibling subdomain injects it: the victim would be typing
// their OWN password into /vincular-conta while unknowingly linking the
// ATTACKER's (provider, providerSub) to their own account — handing the
// attacker a way to log into the victim's existing account afterwards via
// that OIDC identity. Same __Host- fix as oidc_flow, same reasoning.
export function getLinkingTokenCookieName(): string {
  return useHostPrefix() ? '__Host-linking_token' : 'linking_token';
}

// Deliberately NOT forced to Lax like oidc_flow above: linking_token is set
// by the same callback redirect, but read back on a same-origin-to-the-API
// XHR POST (/auth/oidc/link) from the web app's page, not a top-level
// navigation. If the web app and the API are deployed on different
// registrable domains (COOKIE_SAMESITE=none, see security-standards.md),
// that XHR is itself cross-site — a cookie hardcoded to Lax would never be
// sent on it, and linking would always 401 with "missing token" in exactly
// that deployment shape. Respecting the configured COOKIE_SAMESITE is what
// makes this work in both the same-site and cross-site cases.
export function getLinkingTokenCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: getCookieSameSite(),
    path: '/',
    ...(useHostPrefix() ? {} : { domain: getCookieDomain() }),
    httpOnly: true,
    maxAge: OIDC_COOKIE_MAX_AGE_MS,
  };
}

// res.clearCookie must be called with the same name/path/domain used to set
// the cookie, or the browser keeps the original one alive under the old
// attrs — these two mirror getOidcFlowCookieOptions/
// getLinkingTokenCookieOptions exactly (including the conditional `domain`)
// rather than reusing the generic getClearCookieOptions() above, which
// always includes COOKIE_DOMAIN and would silently fail to clear the
// `__Host-` cookie once Secure is on.
export function getClearOidcFlowCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: 'lax',
    path: '/',
    ...(useHostPrefix() ? {} : { domain: getCookieDomain() }),
  };
}

export function getClearLinkingTokenCookieOptions(): CookieOptions {
  return {
    secure: isCookieSecure(),
    sameSite: getCookieSameSite(),
    path: '/',
    ...(useHostPrefix() ? {} : { domain: getCookieDomain() }),
  };
}
