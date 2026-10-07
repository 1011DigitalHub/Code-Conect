import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClearCookieOptions,
  getCookieSameSite,
  getCsrfCookieOptions,
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
