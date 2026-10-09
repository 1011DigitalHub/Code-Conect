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

  it('returns undefined for a malformed cookie (no signature at all), instead of throwing', () => {
    expect(readOidcFlowCookie(fakeRequestWithCookie('not-base64url-json'))).toBeUndefined();
  });

  it('rejects a self-consistent payload signed with the wrong signature — the round-8 login-CSRF case: a sibling subdomain (under a shared COOKIE_DOMAIN) can set this cookie to any value it likes, but can\'t produce a signature we accept without the secret', () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({ provider: 'google', state: 'attacker-state', codeVerifier: 'attacker-verifier', exp: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(readOidcFlowCookie(fakeRequestWithCookie(`${forgedPayload}.not-the-real-mac`))).toBeUndefined();
  });

  it('rejects a correctly-signed payload whose fields were edited afterwards', () => {
    const { res, cookie } = fakeResponse();
    setOidcFlowCookie(res, flow);
    const [, value] = cookie.mock.calls[0] as [string, string];
    const [encoded, mac] = value.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...flow, state: 'attacker-state', exp: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(
      readOidcFlowCookie(fakeRequestWithCookie(encodeURIComponent(`${tamperedPayload}.${mac}`))),
    ).toBeUndefined();
    // sanity check: the untampered value this mac actually belongs to still works
    expect(readOidcFlowCookie(fakeRequestWithCookie(encodeURIComponent(`${encoded}.${mac}`)))).toEqual(flow);
  });

  it('rejects a cookie signed with a different secret', () => {
    vi.stubEnv('OIDC_LINKING_TOKEN_SECRET', 'a'.repeat(32));
    const { res, cookie } = fakeResponse();
    setOidcFlowCookie(res, flow);
    const [, value] = cookie.mock.calls[0] as [string, string];
    vi.stubEnv('OIDC_LINKING_TOKEN_SECRET', 'b'.repeat(32));
    expect(readOidcFlowCookie(fakeRequestWithCookie(encodeURIComponent(value)))).toBeUndefined();
    vi.unstubAllEnvs();
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
