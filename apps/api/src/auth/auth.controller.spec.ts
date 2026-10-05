import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserEntity } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

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

  it('logs in through the AuthService', async () => {
    authService.signIn.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    const result = await controller.login({
      email: 'maria@exemplo.com',
      password: 'senha-segura-123',
    });
    expect(authService.signIn).toHaveBeenCalledWith(
      'maria@exemplo.com',
      'senha-segura-123',
    );
    expect(result.accessToken).toBe('token');
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
