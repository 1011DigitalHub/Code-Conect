import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { hashPassword, shouldRehash, verifyPassword } from '../users/password.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// The legacy, unversioned format every account created before password.ts's
// cost-versioning existed has stored — used here to prove AuthService
// re-hashes it on the next successful login.
async function legacyHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: { findByEmail: ReturnType<typeof vi.fn>; updatePasswordHash: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const maria = {
      id: 1,
      name: 'Maria',
      email: 'maria@exemplo.com',
      passwordHash: await hashPassword('senha-segura-123'),
      createdAt: new Date(),
    };
    usersService = {
      findByEmail: vi.fn((email: string) =>
        Promise.resolve(email === maria.email ? maria : null),
      ),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
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

  it('does not rehash a password already at the current cost', async () => {
    await service.signIn('maria@exemplo.com', 'senha-segura-123');
    expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('rehashes a legacy-format password on successful login, without blocking it', async () => {
    const legacy = await legacyHash('senha-segura-123');
    expect(shouldRehash(legacy)).toBe(true);
    usersService.findByEmail.mockResolvedValue({
      id: 2,
      name: 'Ana',
      email: 'ana@exemplo.com',
      passwordHash: legacy,
      createdAt: new Date(),
    });

    const result = await service.signIn('ana@exemplo.com', 'senha-segura-123');

    expect(result.tokenType).toBe('Bearer');
    expect(usersService.updatePasswordHash).toHaveBeenCalledTimes(1);
    const [id, newHash] = usersService.updatePasswordHash.mock.calls[0] as [number, string];
    expect(id).toBe(2);
    expect(shouldRehash(newHash)).toBe(false);
    await expect(verifyPassword('senha-segura-123', newHash)).resolves.toBe(true);
  });
});
