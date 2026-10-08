import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StoredUser } from './entities/user.entity.js';
import { verifyPassword } from './password.js';
import { UsersService } from './users.service.js';

const dto = {
  name: 'Maria Silva',
  email: 'Maria@Exemplo.com',
  password: 'senha-segura-123',
};

const stored: StoredUser = {
  id: 1,
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  passwordHash: 'salt:hash',
  createdAt: new Date('2026-10-02T12:00:00.000Z'),
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { create: Mock; findUnique: Mock; findFirst: Mock; update: Mock };
    oidcIdentity: { create: Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      oidcIdentity: { create: vi.fn() },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('creates a user without exposing the password', async () => {
    prisma.user.create.mockResolvedValue(stored);
    const user = await service.create(dto);
    expect(user).toMatchObject({
      id: 1,
      name: 'Maria Silva',
      email: 'maria@exemplo.com',
      createdAt: '2026-10-02T12:00:00.000Z',
      links: { self: '/users/1' },
    });
    expect(JSON.stringify(user)).not.toMatch(/password/i);
  });

  it('stores the normalized email and a hash, never the password', async () => {
    prisma.user.create.mockResolvedValue(stored);
    await service.create(dto);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    // The assertion above is what actually guarantees calls[0] exists; the
    // non-null assertion just tells noUncheckedIndexedAccess what the test
    // already proved, instead of an unsafe optional-chain into a destructure.
    const { data } = prisma.user.create.mock.calls[0]![0];
    expect(data.email).toBe('maria@exemplo.com');
    expect(data).not.toHaveProperty('password');
    expect(data.passwordHash).not.toContain(dto.password);
    expect(await verifyPassword(dto.password, data.passwordHash)).toBe(true);
  });

  it('turns a duplicated email into a ConflictException', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.create(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('finds a user by email, ignoring case, opting back into the omitted password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(stored);
    await expect(service.findByEmail('MARIA@exemplo.com')).resolves.toBe(
      stored,
    );
    // passwordHash is omitted globally (see PrismaService); login is the
    // one place that needs it to verify the password, so this call must
    // explicitly opt back in.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'maria@exemplo.com' },
      omit: { passwordHash: false },
    });
  });

  it('finds a user by id and throws when it does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(stored);
    await expect(service.findById(1)).resolves.toMatchObject({
      email: 'maria@exemplo.com',
    });
    // No omit override: unlike findByEmail, this never needs the password
    // hash, so it leaves the global default (omitted) in place.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates the stored password hash', async () => {
    prisma.user.update.mockResolvedValue(stored);
    await service.updatePasswordHash(1, 'new-hash');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { passwordHash: 'new-hash' },
    });
  });

  describe('findByProviderIdentity', () => {
    it('looks up a user through the identities relation', async () => {
      prisma.user.findFirst.mockResolvedValue(stored);
      await expect(service.findByProviderIdentity('google', 'sub-123')).resolves.toBe(stored);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { identities: { some: { provider: 'google', providerSub: 'sub-123' } } },
      });
    });

    it('returns null when no user has that identity', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findByProviderIdentity('google', 'sub-123')).resolves.toBeNull();
    });
  });

  describe('createFromOidc', () => {
    it('creates a user with no password hash and the identity in one write', async () => {
      prisma.user.create.mockResolvedValue({ ...stored, passwordHash: null });
      await service.createFromOidc({
        name: 'Nova Pessoa',
        email: 'nova@exemplo.com',
        provider: 'google',
        providerSub: 'sub-456',
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Nova Pessoa',
          email: 'nova@exemplo.com',
          passwordHash: null,
          identities: { create: { provider: 'google', providerSub: 'sub-456' } },
        },
      });
    });
  });

  describe('linkProviderIdentity', () => {
    it('creates the OidcIdentity row for the given user', async () => {
      prisma.oidcIdentity.create.mockResolvedValue({});
      await service.linkProviderIdentity(1, 'google', 'sub-789');
      expect(prisma.oidcIdentity.create).toHaveBeenCalledWith({
        data: { userId: 1, provider: 'google', providerSub: 'sub-789' },
      });
    });

    // The @@unique([provider, providerSub]) constraint is what actually
    // stops the same identity from ever being linked to two different
    // users (a replayed linking_token, or a genuine race between two
    // requests for the same auto-link) — this proves the Prisma error it
    // raises comes back as a clean 409, not a raw 500.
    it('maps a unique violation (identity already linked to a user) to a ConflictException', async () => {
      prisma.oidcIdentity.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.linkProviderIdentity(1, 'google', 'sub-789')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
