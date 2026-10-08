import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { UserEntity } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { MaybeAuthenticatedRequest } from './auth.types.js';
import { sessionKey, verifyCsrfToken } from './csrf.js';

// Returning the mocks alongside `res` (instead of reading them back off the
// typed Response interface, e.g. `res.cookie`) avoids an unbound-method lint
// warning and keeps the mock type concrete for `.mock.calls` access.
function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const res = { cookie, clearCookie } as unknown as Response;
  return { res, cookie, clearCookie };
}

// Typed as MaybeAuthenticatedRequest (a superset of Request) so a test can
// set `user` the way AuthGuard does on an optionally-authenticated route.
function fakeRequest(cookieHeader?: string): MaybeAuthenticatedRequest {
  return {
    headers: { cookie: cookieHeader },
  } as unknown as MaybeAuthenticatedRequest;
}

describe('AuthController', () => {
  let controller: AuthController;
  const authService = { signIn: vi.fn() };
  const usersService = { findById: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new AuthController(
      authService as unknown as AuthService,
      usersService as unknown as UsersService,
    );
  });

  it('logs in through the AuthService and sets the session cookie', async () => {
    authService.signIn.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    const { res, cookie } = fakeResponse();
    const result = await controller.login(
      { email: 'maria@exemplo.com', password: 'senha-segura-123' },
      res,
    );
    expect(authService.signIn).toHaveBeenCalledWith(
      'maria@exemplo.com',
      'senha-segura-123',
      false,
    );
    // The raw token must never reach the response body — only the cookie.
    expect(result).toStrictEqual({ tokenType: 'Bearer', expiresIn: 3600 });
    expect(result).not.toHaveProperty('accessToken');
    expect(cookie).toHaveBeenCalledWith(
      'access_token',
      'token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('rotates the csrf token bound to the new access token on login', async () => {
    authService.signIn.mockResolvedValue({
      accessToken: 'brand-new-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    const { res, cookie } = fakeResponse();
    await controller.login(
      { email: 'maria@exemplo.com', password: 'senha-segura-123' },
      res,
    );
    const csrfCall = cookie.mock.calls.find(
      (call: unknown[]) => call[0] === 'csrf_token',
    ) as [string, string, Record<string, unknown>];
    expect(csrfCall).toBeDefined();
    const [, csrfToken, options] = csrfCall;
    expect(options.httpOnly).toBe(false);
    // Must validate against the NEW token's session key, not any stale
    // access_token cookie the login request happened to carry.
    expect(verifyCsrfToken(csrfToken, sessionKey('brand-new-token'))).toBe(true);
    expect(verifyCsrfToken(csrfToken, sessionKey('some-other-token'))).toBe(false);
  });

  it('mints an anonymous-bound csrf token on GET /auth/csrf with no session', () => {
    const { res, cookie } = fakeResponse();
    controller.csrf(fakeRequest(undefined), res);
    const [, token] = cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(verifyCsrfToken(token, sessionKey(undefined))).toBe(true);
  });

  it('passes remember through to the service and sets a persistent cookie', async () => {
    authService.signIn.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: 604800,
    });
    const { res, cookie } = fakeResponse();
    await controller.login(
      { email: 'maria@exemplo.com', password: 'senha-segura-123', remember: true },
      res,
    );
    expect(authService.signIn).toHaveBeenCalledWith(
      'maria@exemplo.com',
      'senha-segura-123',
      true,
    );
    expect(cookie).toHaveBeenCalledWith(
      'access_token',
      'token',
      expect.objectContaining({ maxAge: 604_800_000 }),
    );
  });

  it('does not set Max-Age (a session cookie) when remember is false', async () => {
    authService.signIn.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    const { res, cookie } = fakeResponse();
    await controller.login(
      { email: 'maria@exemplo.com', password: 'senha-segura-123' },
      res,
    );
    const [, , options] = cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(options.maxAge).toBeUndefined();
  });

  it('clears both the session and csrf cookies on logout', () => {
    const { res, clearCookie } = fakeResponse();
    controller.logout(res);
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.objectContaining({ path: '/' }),
    );
  });

  it('returns the logged user', async () => {
    usersService.findById.mockResolvedValue(
      new UserEntity({
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        passwordHash: 'salt:hash',
        createdAt: new Date(),
      }),
    );
    const user = await controller.me({ sub: 1, email: 'maria@exemplo.com' });
    expect(usersService.findById).toHaveBeenCalledWith(1);
    expect(user.name).toBe('Maria');
  });

  it('treats a token for a missing user as unauthorized', async () => {
    usersService.findById.mockRejectedValue(new NotFoundException());
    await expect(
      controller.me({ sub: 99, email: 'x@exemplo.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('GET /auth/session', () => {
    // The public probe: a page that renders for anonymous and logged-in
    // visitors alike must not provoke a 401 the browser logs to the console.
    it('reports the user when the request carried a valid session', async () => {
      usersService.findById.mockResolvedValue(
        new UserEntity({
          id: 1,
          name: 'Maria',
          email: 'maria@exemplo.com',
          passwordHash: 'salt:hash',
          createdAt: new Date(),
        }),
      );

      const req = fakeRequest();
      req.user = { sub: 1, email: 'maria@exemplo.com' };

      const result = await controller.session(req);

      expect(usersService.findById).toHaveBeenCalledWith(1);
      expect(result.user?.name).toBe('Maria');
    });

    it('reports a null user for an anonymous visitor, without 401', async () => {
      const result = await controller.session(fakeRequest());

      expect(result).toEqual({ user: null });
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('reports a null user when the token names someone who no longer exists', async () => {
      usersService.findById.mockRejectedValue(new NotFoundException());

      const req = fakeRequest();
      req.user = { sub: 99, email: 'x@exemplo.com' };

      await expect(controller.session(req)).resolves.toEqual({ user: null });
    });
  });
});
