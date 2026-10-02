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
  let prisma: { user: { create: Mock; findUnique: Mock } };

  beforeEach(() => {
    prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
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
    const { data } = prisma.user.create.mock.calls[0][0];
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

  it('finds a user by email, ignoring case', async () => {
    prisma.user.findUnique.mockResolvedValue(stored);
    await expect(service.findByEmail('MARIA@exemplo.com')).resolves.toBe(
      stored,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'maria@exemplo.com' },
    });
  });

  it('finds a user by id and throws when it does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(stored);
    await expect(service.findById(1)).resolves.toMatchObject({
      email: 'maria@exemplo.com',
    });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
