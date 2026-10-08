import type { Request, Response } from 'express';
import { clearOidcFlowCookie, readOidcFlowCookie, setOidcFlowCookie } from './oidc-flow-cookie.js';

function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const res = { cookie, clearCookie } as unknown as Response;
  return { res, cookie, clearCookie };
}

function fakeRequestWithCookie(value: string | undefined): Request {
  return { headers: { cookie: value ? `oidc_flow=${value}` : undefined } } as unknown as Request;
}

const flow = { provider: 'google' as const, state: 'state-123', codeVerifier: 'verifier-456' };

describe('oidc-flow-cookie', () => {
  it('round-trips a flow through set + read', () => {
    const { res, cookie } = fakeResponse();
    setOidcFlowCookie(res, flow);
    const [, encoded, options] = cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });

    const req = fakeRequestWithCookie(encodeURIComponent(encoded));
    expect(readOidcFlowCookie(req)).toEqual(flow);
  });

  it('returns undefined when there is no cookie', () => {
    expect(readOidcFlowCookie(fakeRequestWithCookie(undefined))).toBeUndefined();
  });

  it('returns undefined for a malformed or tampered cookie, instead of throwing', () => {
    expect(readOidcFlowCookie(fakeRequestWithCookie('not-base64url-json'))).toBeUndefined();
    const notAnObject = Buffer.from('"just a string"').toString('base64url');
    expect(readOidcFlowCookie(fakeRequestWithCookie(notAnObject))).toBeUndefined();
    const missingField = Buffer.from(JSON.stringify({ provider: 'google' })).toString('base64url');
    expect(readOidcFlowCookie(fakeRequestWithCookie(missingField))).toBeUndefined();
  });

  it('treats an expired cookie as absent, independent of the cookie Max-Age the browser enforces', () => {
    const { res, cookie } = fakeResponse();
    setOidcFlowCookie(res, flow);
    const [, encoded] = cookie.mock.calls[0] as [string, string];
    const req = fakeRequestWithCookie(encodeURIComponent(encoded));

    expect(readOidcFlowCookie(req)).toEqual(flow);
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute ttl
    expect(readOidcFlowCookie(req)).toBeUndefined();
    vi.useRealTimers();
  });

  it('clears the cookie with Lax/the clear options, not the app default SameSite', () => {
    const { res, clearCookie } = fakeResponse();
    clearOidcFlowCookie(res);
    expect(clearCookie).toHaveBeenCalledWith('oidc_flow', expect.objectContaining({ sameSite: 'lax' }));
  });
});
