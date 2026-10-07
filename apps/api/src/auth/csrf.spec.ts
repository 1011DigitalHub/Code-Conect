import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintCsrfToken, sessionKey, verifyCsrfToken } from './csrf.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sessionKey', () => {
  it('derives the same key for the same token', () => {
    expect(sessionKey('token-a')).toBe(sessionKey('token-a'));
  });

  it('derives different keys for different tokens', () => {
    expect(sessionKey('token-a')).not.toBe(sessionKey('token-b'));
  });

  it('has a distinct key for "no token" (anonymous)', () => {
    expect(sessionKey(undefined)).not.toBe(sessionKey('token-a'));
  });
});

describe('mintCsrfToken / verifyCsrfToken', () => {
  it('round-trips: a minted token verifies against the same key', () => {
    const key = sessionKey('some-session');
    const token = mintCsrfToken(key);
    expect(verifyCsrfToken(token, key)).toBe(true);
  });

  it('rejects a token verified against a different session key', () => {
    const token = mintCsrfToken(sessionKey('session-a'));
    expect(verifyCsrfToken(token, sessionKey('session-b'))).toBe(false);
  });

  it('rejects a tampered nonce', () => {
    const key = sessionKey('some-session');
    const token = mintCsrfToken(key);
    const [, mac] = token.split('.');
    expect(verifyCsrfToken(`tampered-nonce.${mac}`, key)).toBe(false);
  });

  it('rejects a tampered mac', () => {
    const key = sessionKey('some-session');
    const token = mintCsrfToken(key);
    const [nonce] = token.split('.');
    expect(verifyCsrfToken(`${nonce}.tampered-mac`, key)).toBe(false);
  });

  it('rejects a malformed token (missing the dot, or empty)', () => {
    const key = sessionKey('some-session');
    expect(verifyCsrfToken('no-dot-here', key)).toBe(false);
    expect(verifyCsrfToken('', key)).toBe(false);
    expect(verifyCsrfToken(undefined, key)).toBe(false);
  });

  it('two tokens minted for the same key are not identical (fresh nonce each time)', () => {
    const key = sessionKey('some-session');
    expect(mintCsrfToken(key)).not.toBe(mintCsrfToken(key));
  });

  it('uses CSRF_SECRET when set, independently of JWT_SECRET', () => {
    vi.stubEnv('CSRF_SECRET', 'a-dedicated-csrf-secret');
    const key = sessionKey('some-session');
    const token = mintCsrfToken(key);
    expect(verifyCsrfToken(token, key)).toBe(true);

    vi.stubEnv('CSRF_SECRET', 'a-different-csrf-secret');
    expect(verifyCsrfToken(token, key)).toBe(false);
  });
});
