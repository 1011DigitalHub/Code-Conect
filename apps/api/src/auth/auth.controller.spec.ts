import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const usersService = new UsersService();
    await usersService.create({
      name: 'Maria',
      email: 'maria@exemplo.com',
      password: 'senha-segura-123',
    });
    const authService = new AuthService(
      usersService,
      new JwtService({ secret: 'test-secret' }),
    );
    controller = new AuthController(authService, usersService);
  });

  it('logs in through the AuthService', async () => {
    const result = await controller.login({
      email: 'maria@exemplo.com',
      password: 'senha-segura-123',
    });
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('returns the logged user', () => {
    const req = { user: { sub: 1, email: 'maria@exemplo.com' } };
    expect(controller.me(req as AuthenticatedRequest).name).toBe('Maria');
  });

  it('treats a token for a missing user as unauthorized', () => {
    const req = { user: { sub: 99, email: 'x@exemplo.com' } };
    expect(() => controller.me(req as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
  });
});
