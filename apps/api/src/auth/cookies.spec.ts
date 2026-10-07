import type { Request } from 'express';
import { readCookie } from './cookies.js';

function requestWith(cookies: Record<string, string> | undefined, header?: string) {
  return {
    cookies,
    headers: { cookie: header },
  } as unknown as Request;
}

describe('readCookie', () => {
  it('reads from a pre-parsed req.cookies when present', () => {
    const req = requestWith({ access_token: 'abc' });
    expect(readCookie(req, 'access_token')).toBe('abc');
  });

  it('falls back to parsing the raw Cookie header', () => {
    const req = requestWith(undefined, 'access_token=abc; csrf_token=def');
    expect(readCookie(req, 'access_token')).toBe('abc');
    expect(readCookie(req, 'csrf_token')).toBe('def');
  });

  it('returns undefined when the cookie is absent', () => {
    const req = requestWith(undefined, 'other=1');
    expect(readCookie(req, 'access_token')).toBeUndefined();
  });

  it('returns undefined when there is no Cookie header at all', () => {
    const req = requestWith(undefined, undefined);
    expect(readCookie(req, 'access_token')).toBeUndefined();
  });

  it('percent-decodes the value', () => {
    const req = requestWith(undefined, 'csrf_token=nonce%2Emac');
    expect(readCookie(req, 'csrf_token')).toBe('nonce.mac');
  });

  it('prefers the pre-parsed cookie over the raw header', () => {
    const req = requestWith({ access_token: 'from-cookies' }, 'access_token=from-header');
    expect(readCookie(req, 'access_token')).toBe('from-cookies');
  });
});
