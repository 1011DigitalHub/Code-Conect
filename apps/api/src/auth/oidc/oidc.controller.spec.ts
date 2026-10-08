import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
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
    controller = new OidcController(oidcService as unknown as OidcService);
  });

  describe('start', () => {
    it('rejects an unknown provider before setting any cookie or redirecting', () => {
      const { res, cookie, redirect } = fakeResponse();
      expect(() => controller.start('github', res)).toThrow(BadRequestException);
      expect(cookie).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('sets the oidc_flow cookie and redirects to the URL OidcService built', () => {
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

    it('rejects when there is no oidc_flow cookie at all', async () => {
      const { res } = fakeResponse();
      await expect(
        controller.callback('google', 'code', 'state-abc', fakeRequest(undefined), res),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(oidcService.authenticate).not.toHaveBeenCalled();
    });

    it('rejects when the query state does not match the cookie state', async () => {
      const { res } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await expect(
        controller.callback('google', 'code', 'wrong-state', req, res),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(oidcService.authenticate).not.toHaveBeenCalled();
    });

    it('rejects when the route provider does not match the one the flow was started for', async () => {
      const { res } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await expect(
        controller.callback('microsoft', 'code', 'state-abc', req, res),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a missing code', async () => {
      const { res } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));
      await expect(
        controller.callback('google', undefined, 'state-abc', req, res),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('always clears the oidc_flow cookie, even on rejection', async () => {
      const { res, clearCookie } = fakeResponse();
      await expect(
        controller.callback('google', 'code', 'state', fakeRequest(undefined), res),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(clearCookie).toHaveBeenCalledWith('oidc_flow', expect.any(Object));
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
      const { res, cookie, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));

      await controller.callback('google', 'the-code', 'state-abc', req, res);

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
    });

    it('sets the linking_token cookie and redirects to /vincular-conta when linking is required', async () => {
      oidcService.authenticate.mockResolvedValue({
        kind: 'linkingRequired',
        linkingToken: 'signed.token',
      });
      const { res, cookie, redirect } = fakeResponse();
      const req = fakeRequest(flowCookieHeader(flow));

      await controller.callback('google', 'the-code', 'state-abc', req, res);

      expect(oidcService.mintSession).not.toHaveBeenCalled();
      const linkCall = cookie.mock.calls.find((c: unknown[]) => c[0] === 'linking_token');
      expect(linkCall?.[1]).toBe('signed.token');
      expect(redirect).toHaveBeenCalledWith('http://localhost:5173/vincular-conta?provider=google');
    });
  });

  describe('link', () => {
    it('reads the linking_token from the cookie (never the body) and clears it before validating', async () => {
      oidcService.linkAccount.mockResolvedValue({ accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 });
      const { res, clearCookie } = fakeResponse();
      const req = fakeRequest('linking_token=signed.token; other=1');

      await controller.link({ password: 'senha-segura-123' }, req, res);

      expect(oidcService.linkAccount).toHaveBeenCalledWith('signed.token', 'senha-segura-123');
      expect(clearCookie).toHaveBeenCalledWith('linking_token', expect.any(Object));
    });

    it('sets the session cookies and returns the login response body on success', async () => {
      oidcService.linkAccount.mockResolvedValue({
        accessToken: 'token-456',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
      const { res, cookie } = fakeResponse();

      const body = await controller.link(
        { password: 'senha-segura-123' },
        fakeRequest('linking_token=signed.token'),
        res,
      );

      expect(body).toStrictEqual({ tokenType: 'Bearer', expiresIn: 3600 });
      expect(cookie.mock.calls.some((c: unknown[]) => c[0] === 'access_token' && c[1] === 'token-456')).toBe(true);
    });

    it('propagates OidcService.linkAccount rejections (invalid token / wrong password)', async () => {
      oidcService.linkAccount.mockRejectedValue(new Error('nope'));
      const { res } = fakeResponse();
      await expect(
        controller.link({ password: 'x' }, fakeRequest(undefined), res),
      ).rejects.toThrow('nope');
    });
  });
});
