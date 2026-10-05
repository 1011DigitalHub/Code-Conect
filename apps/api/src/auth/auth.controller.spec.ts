import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { UserEntity } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

// Returning the mocks alongside `res` (instead of reading them back off the
// typed Response interface, e.g. `res.cookie`) avoids an unbound-method lint
// warning and keeps the mock type concrete for `.mock.calls` access.
function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const res = { cookie, clearCookie } as unknown as Response;
  return { res, cookie, clearCookie };
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
    expect(result.accessToken).toBe('token');
    expect(cookie).toHaveBeenCalledWith(
      'access_token',
      'token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
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

  it('clears the session cookie on logout', () => {
    const { res, clearCookie } = fakeResponse();
    controller.logout(res);
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
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
});
