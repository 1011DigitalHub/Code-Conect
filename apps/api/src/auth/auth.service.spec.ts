import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword } from '../users/password.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const maria = {
      id: 1,
      name: 'Maria',
      email: 'maria@exemplo.com',
      passwordHash: await hashPassword('senha-segura-123'),
      createdAt: new Date(),
    };
    const usersService = {
      findByEmail: vi.fn((email: string) =>
        Promise.resolve(email === maria.email ? maria : null),
      ),
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService,
    );
  });

  it('returns a verifiable token for valid credentials', async () => {
    const result = await service.signIn(
      'maria@exemplo.com',
      'senha-segura-123',
    );
    expect(result.tokenType).toBe('Bearer');
    const payload = await jwtService.verifyAsync<{ sub: number }>(
      result.accessToken,
    );
    expect(payload.sub).toBe(1);
  });

  it('rejects an unknown email and a wrong password', async () => {
    await expect(
      service.signIn('x@exemplo.com', 'senha-segura-123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.signIn('maria@exemplo.com', 'errada'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses the short-lived ttl by default', async () => {
    const result = await service.signIn('maria@exemplo.com', 'senha-segura-123');
    expect(result.expiresIn).toBe(3600);
  });

  it('uses the remember-me ttl when remember is true', async () => {
    const result = await service.signIn(
      'maria@exemplo.com',
      'senha-segura-123',
      true,
    );
    expect(result.expiresIn).toBe(7 * 24 * 3600);
  });
});
