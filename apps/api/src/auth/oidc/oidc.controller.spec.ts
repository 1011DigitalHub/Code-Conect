import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getClearLinkingTokenCookieOptions } from '../cookie.constants.js';
import { verifyCsrfToken, sessionKey } from '../csrf.js';
import { setOidcFlowCookie } from './oidc-flow-cookie.js';
import { OidcController } from './oidc.controller.js';
import type { OidcService } from './oidc.service.js';

function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const redirect = vi.fn();
  const res = { cookie, clearCookie, redirect } as unknown as Response;
  return { res, cookie, clearCookie, redirect };
}

// Builds a real oidc_flow cookie value (via the same helper the controller
// itself reads with) and hands back the header string a request would
// carry, so these tests exercise the real cookie encoding, not a stub of it.
function flowCookieHeader(flow: { provider: 'google' | 'microsoft'; state: string; codeVerifier: string }): string {
  const { cookie } = fakeResponse();
  setOidcFlowCookie({ cookie } as unknown as Response, flow);
  const [, value] = cookie.mock.calls[0] as [string, string];
  return `oidc_flow=${value}`;
}

function fakeRequest(cookieHeader?: string): Request {
  return { headers: { cookie: cookieHeader } } as unknown as Request;
}

describe('OidcController', () => {
  let controller: OidcController;
  const oidcService = {
    buildAuthorizationUrl: vi.fn(),
    authenticate: vi.fn(),
    mintSession: vi.fn(),
    linkAccount: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    controller = new OidcController(oidcService as unknown as OidcService);
  });

  describe('start', () => {
    it('rejects an unknown provider before setting any cookie or redirecting', () => {
      const { res, cookie, redirect } = fakeResponse();
      expect(() => controller.start('github', res)).toThrow(BadRequestException);
      expect(cookie).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('redirects to /login?oidcError=1 instead of starting a flow when the provider has no credentials set', () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      const { res, cookie, redirect } = fakeResponse();
      controller.start('google', res);
      expect(cookie).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
    });

    it('sets the oidc_flow cookie and redirects to the URL OidcService built', () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'configured-client-id');
      oidcService.buildAuthorizationUrl.mockReturnValue('https://accounts.google.com/authorize?...');
      const { res, cookie, redirect } = fakeResponse();

      controller.start('google', res);

      const [name, , options] = cookie.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(name).toBe('oidc_flow');
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
      expect(oidcService.buildAuthorizationUrl).toHaveBeenCalledWith(
        'google',
        expect.any(String),
        expect.any(String),
      );
      expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/authorize?...');
    });
  });

  describe('callback', () => {
    const flow = { provider: 'google' as const, state: 'state-abc', codeVerifier: 'verifier-xyz' };

    // Every one of these happens through a browser redirect a real person
    // is driving (or an attacker tampering with one) — never a raw JSON
    // error on the API's own origin, which would be jarring mid-navigation
    // and, for the person-driven cases (?error=, an expired flow), is not
    // a security exception to begin with.
    it('redirects to /login when there is no oidc_flow cookie at all', async () => {
      const { res, redirect } = fakeResponse();
      await controller.callback('google', 'code', 'state-abc', undefined, fakeRequest(undefined), res);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
      expect(oidcService.authenticate).not.toHaveBeenCalled();
    });

    it('redirects to /login when the query state does not match the cookie state', async () => {
      const { res, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await controller.callback('google', 'code', 'wrong-state', undefined, req, res);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
      expect(oidcService.authenticate).not.toHaveBeenCalled();
    });

    it('redirects to /login when the route provider does not match the one the flow was started for', async () => {
      const { res, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await controller.callback('microsoft', 'code', 'state-abc', undefined, req, res);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
    });

    it('redirects to /login on a missing code', async () => {
      const { res, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await controller.callback('google', undefined, 'state-abc', undefined, req, res);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
    });

    it('redirects to /login when OidcService.authenticate rejects (bad signature, wrong aud, unverified email, ...)', async () => {
      oidcService.authenticate.mockRejectedValue(new UnauthorizedException('nope'));
      const { res, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await controller.callback('google', 'the-code', 'state-abc', undefined, req, res);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
    });

    it('lets a non-HttpException (a genuine bug) propagate instead of masking it as a redirect', async () => {
      oidcService.authenticate.mockRejectedValue(new Error('boom'));
      const { res, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await expect(
        controller.callback('google', 'the-code', 'state-abc', undefined, req, res),
      ).rejects.toThrow('boom');
      expect(redirect).not.toHaveBeenCalled();
    });

    it('always clears the oidc_flow cookie, even on rejection', async () => {
      const { res, clearCookie } = fakeResponse();
      await controller.callback('google', 'code', 'state', undefined, fakeRequest(undefined), res);
      expect(clearCookie).toHaveBeenCalledWith('oidc_flow', expect.any(Object));
    });

    it('redirects to /login when the provider sends ?error= (e.g. the person cancelled)', async () => {
      const { res, redirect } = fakeResponse();
      await controller.callback('google', undefined, undefined, 'access_denied', fakeRequest(undefined), res);

      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/login?oidcError=1');
      expect(oidcService.authenticate).not.toHaveBeenCalled();
    });

    it('signs in and redirects to the web app /perfil on a direct match', async () => {
      oidcService.authenticate.mockResolvedValue({
        kind: 'signedIn',
        user: { id: 1, email: 'maria@exemplo.com' },
      });
      oidcService.mintSession.mockResolvedValue({
        accessToken: 'token-123',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
      const { res, cookie, clearCookie, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));

      await controller.callback('google', 'the-code', 'state-abc', undefined, req, res);

      expect(oidcService.authenticate).toHaveBeenCalledWith('google', 'the-code', 'verifier-xyz');
      const accessCall = cookie.mock.calls.find((c: unknown[]) => c[0] === 'access_token');
      expect(accessCall?.[1]).toBe('token-123');
      const csrfCall = cookie.mock.calls.find((c: unknown[]) => c[0] === 'csrf_token') as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(verifyCsrfToken(csrfCall[1], sessionKey('token-123'))).toBe(true);
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/perfil');
      // Round 14 of plan/LoginSocial.md's review (tightened in PR #28's own
      // second round): a leftover linking_token from an earlier, abandoned
      // /vincular-conta attempt must not survive a successful sign-in
      // through a different path — and the options must match what it was
      // actually set with, or the browser never drops the cookie.
      expect(clearCookie).toHaveBeenCalledWith('linking_token', getClearLinkingTokenCookieOptions());
    });

    it('sets the linking_token cookie and redirects to /vincular-conta when linking is required', async () => {
      oidcService.authenticate.mockResolvedValue({
        kind: 'linkingRequired',
        linkingToken: 'signed.token',
      });
      const { res, cookie, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));

      await controller.callback('google', 'the-code', 'state-abc', undefined, req, res);

      expect(oidcService.mintSession).not.toHaveBeenCalled();
      const linkCall = cookie.mock.calls.find((c: unknown[]) => c[0] === 'linking_token');
      expect(linkCall?.[1]).toBe('signed.token');
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/vincular-conta?provider=google');
    });
  });

  describe('link', () => {
    it('reads the linking_token from the cookie, never the body', async () => {
      oidcService.linkAccount.mockResolvedValue({ accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 });
      const { res } = fakeResponse();
      const req = fakeRequest('linking_token=signed.token; other=1');

      await controller.link({ password: 'senha-segura-123' }, req, res);

      expect(oidcService.linkAccount).toHaveBeenCalledWith('signed.token', 'senha-segura-123');
    });

    it('sets the session cookies, clears the linking_token cookie, and returns the login response body on success', async () => {
      oidcService.linkAccount.mockResolvedValue({
        accessToken: 'token-456',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
      const { res, cookie, clearCookie } = fakeResponse();

      const body = await controller.link(
        { password: 'senha-segura-123' },
        fakeRequest('linking_token=signed.token'),
        res,
      );

      expect(body).toStrictEqual({ tokenType: 'Bearer', expiresIn: 3600 });
      expect(cookie.mock.calls.some((c: unknown[]) => c[0] === 'access_token' && c[1] === 'token-456')).toBe(true);
      expect(clearCookie).toHaveBeenCalledWith('linking_token', expect.any(Object));
    });

    it('propagates OidcService.linkAccount rejections (invalid token / wrong password) without clearing the cookie — a retry can reuse it', async () => {
      oidcService.linkAccount.mockRejectedValue(new Error('nope'));
      const { res, clearCookie } = fakeResponse();
      await expect(
        controller.link({ password: 'x' }, fakeRequest(undefined), res),
      ).rejects.toThrow('nope');
      expect(clearCookie).not.toHaveBeenCalled();
    });

    // Unlike a wrong password, a 409 (the identity is already linked — a
    // replay or a race with another request) can never succeed on a retry
    // with that same token, so there is nothing to preserve it for.
    it('clears the linking_token cookie on a 409 (already linked), unlike other rejections', async () => {
      oidcService.linkAccount.mockRejectedValue(new ConflictException('já vinculada'));
      const { res, clearCookie } = fakeResponse();
      await expect(
        controller.link({ password: 'x' }, fakeRequest('linking_token=signed.token'), res),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(clearCookie).toHaveBeenCalledWith('linking_token', expect.any(Object));
    });
  });
});
