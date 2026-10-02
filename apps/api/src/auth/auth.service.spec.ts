import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const usersService = new UsersService();
    await usersService.create({
      name: 'Maria',
      email: 'maria@exemplo.com',
      password: 'senha-segura-123',
    });
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(usersService, jwtService);
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
});
