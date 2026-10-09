import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClearCookieOptions,
  getClearLinkingTokenCookieOptions,
  getClearOidcFlowCookieOptions,
  getCookieSameSite,
  getCsrfCookieOptions,
  getLinkingTokenCookieName,
  getLinkingTokenCookieOptions,
  getOidcFlowCookieName,
  getOidcFlowCookieOptions,
  getSessionCookieOptions,
  isCookieSecure,
} from './cookie.constants.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCookieSecure', () => {
  it('is false by default outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COOKIE_SECURE', '');
    expect(isCookieSecure()).toBe(false);
  });

  it('is true by default in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', '');
    expect(isCookieSecure()).toBe(true);
  });

  it('is overridable explicitly in either direction', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', 'false');
    expect(isCookieSecure()).toBe(false);

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COOKIE_SECURE', 'true');
    expect(isCookieSecure()).toBe(true);
  });
});

describe('getCookieSameSite', () => {
  it('defaults to strict', () => {
    vi.stubEnv('COOKIE_SAMESITE', '');
    expect(getCookieSameSite()).toBe('strict');
  });

  it('accepts lax and none, case-insensitively', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'Lax');
    expect(getCookieSameSite()).toBe('lax');
    vi.stubEnv('COOKIE_SAMESITE', 'NONE');
    expect(getCookieSameSite()).toBe('none');
  });

  it('falls back to strict for an unrecognized value', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'nonsense');
    expect(getCookieSameSite()).toBe('strict');
  });
});

describe('getSessionCookieOptions', () => {
  it('sets Max-Age when remember is true', () => {
    const options = getSessionCookieOptions(true, 3600);
    expect(options.maxAge).toBe(3_600_000);
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/');
  });

  it('omits Max-Age (a session cookie) when remember is false', () => {
    const options = getSessionCookieOptions(false, 3600);
    expect(options.maxAge).toBeUndefined();
  });
});

describe('getCsrfCookieOptions', () => {
  it('is never httpOnly, so the page can read it', () => {
    expect(getCsrfCookieOptions(true, 3600).httpOnly).toBe(false);
  });

  it('mirrors the session cookie Max-Age', () => {
    expect(getCsrfCookieOptions(true, 3600).maxAge).toBe(3_600_000);
    expect(getCsrfCookieOptions(false, 3600).maxAge).toBeUndefined();
  });
});

describe('getClearCookieOptions', () => {
  it('shares path/domain/sameSite/secure with the cookie it clears', () => {
    const cleared = getClearCookieOptions();
    const set = getSessionCookieOptions(true, 3600);
    expect(cleared.path).toBe(set.path);
    expect(cleared.domain).toBe(set.domain);
    expect(cleared.sameSite).toBe(set.sameSite);
    expect(cleared.secure).toBe(set.secure);
  });
});

describe('getOidcFlowCookieOptions', () => {
  it('is always SameSite=Lax, regardless of COOKIE_SAMESITE — it must survive the cross-site redirect back from the provider', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'strict');
    expect(getOidcFlowCookieOptions().sameSite).toBe('lax');
    vi.stubEnv('COOKIE_SAMESITE', 'none');
    expect(getOidcFlowCookieOptions().sameSite).toBe('lax');
  });

  it('is httpOnly with the 5-minute OIDC max age', () => {
    const options = getOidcFlowCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(5 * 60 * 1000);
  });

  it('getClearOidcFlowCookieOptions matches its SameSite=Lax, not the configured COOKIE_SAMESITE', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'strict');
    expect(getClearOidcFlowCookieOptions().sameSite).toBe('lax');
  });
});

// Round 9 of plan/LoginSocial.md's review: signing (round 8) stops a forged
// oidc_flow/linking_token, but not a legitimately-signed one injected from a
// sibling subdomain under a shared parent COOKIE_DOMAIN. __Host- is a
// browser-enforced prefix: it refuses to let ANY origin (including that
// sibling) set the cookie without Secure and without a Domain attribute, so
// the injection attempt is host-only to the sibling's own origin and never
// reaches this API. It only works when Secure is actually on, hence gated
// on isCookieSecure() (same as getOidcFlowCookieName/getLinkingTokenCookieName).
describe('__Host- prefix (oidc_flow/linking_token)', () => {
  it('uses the plain name and respects COOKIE_DOMAIN when Secure is off (dev/test)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COOKIE_SECURE', 'false');
    vi.stubEnv('COOKIE_DOMAIN', '.exemplo.com');

    expect(getOidcFlowCookieName()).toBe('oidc_flow');
    expect(getLinkingTokenCookieName()).toBe('linking_token');
    expect(getOidcFlowCookieOptions().domain).toBe('.exemplo.com');
    expect(getLinkingTokenCookieOptions().domain).toBe('.exemplo.com');
  });

  it('switches to __Host- and drops domain entirely once Secure is on, even with COOKIE_DOMAIN set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', 'true');
    vi.stubEnv('COOKIE_DOMAIN', '.exemplo.com');

    expect(getOidcFlowCookieName()).toBe('__Host-oidc_flow');
    expect(getLinkingTokenCookieName()).toBe('__Host-linking_token');
    expect(getOidcFlowCookieOptions()).not.toHaveProperty('domain');
    expect(getLinkingTokenCookieOptions()).not.toHaveProperty('domain');
    expect(getOidcFlowCookieOptions().secure).toBe(true);
    expect(getLinkingTokenCookieOptions().secure).toBe(true);
  });

  it('the clear options match the name/domain the cookie was actually set with, in both modes', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', 'true');
    vi.stubEnv('COOKIE_DOMAIN', '.exemplo.com');
    expect(getClearOidcFlowCookieOptions()).not.toHaveProperty('domain');
    expect(getClearLinkingTokenCookieOptions()).not.toHaveProperty('domain');

    vi.stubEnv('COOKIE_SECURE', 'false');
    expect(getClearOidcFlowCookieOptions().domain).toBe('.exemplo.com');
    expect(getClearLinkingTokenCookieOptions().domain).toBe('.exemplo.com');
  });
});

describe('getLinkingTokenCookieOptions', () => {
  // The real bug this guards against: linking_token is read back on a
  // same-origin-to-the-API XHR POST (/auth/oidc/link), not a top-level
  // navigation like oidc_flow — hardcoding Lax here would make that XHR
  // silently drop the cookie whenever the web app and the API are deployed
  // on different registrable domains (COOKIE_SAMESITE=none).
  it('respects the configured COOKIE_SAMESITE, unlike oidc_flow', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'none');
    expect(getLinkingTokenCookieOptions().sameSite).toBe('none');
    vi.stubEnv('COOKIE_SAMESITE', 'strict');
    expect(getLinkingTokenCookieOptions().sameSite).toBe('strict');
  });

  it('is httpOnly with the 5-minute OIDC max age', () => {
    const options = getLinkingTokenCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(5 * 60 * 1000);
  });

  it('clears with the configured COOKIE_SAMESITE (not a Lax-specific clear), matching what it was set with', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'none');
    expect(getClearLinkingTokenCookieOptions().sameSite).toBe(getLinkingTokenCookieOptions().sameSite);
  });
});
