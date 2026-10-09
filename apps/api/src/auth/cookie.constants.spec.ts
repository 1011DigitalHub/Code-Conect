import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClearCookieOptions,
  getClearOidcFlowCookieOptions,
  getCookieSameSite,
  getCsrfCookieOptions,
  getLinkingTokenCookieOptions,
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

  it('clears with getClearCookieOptions (the shared, configurable one) rather than a Lax-specific clear', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'none');
    expect(getClearCookieOptions().sameSite).toBe(getLinkingTokenCookieOptions().sameSite);
  });
});
