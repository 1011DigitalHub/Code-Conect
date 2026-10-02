import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';

const dto = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService();
  });

  it('creates a user without exposing the password', async () => {
    const user = await service.create(dto);
    expect(user).toMatchObject({
      id: 1,
      name: 'Maria Silva',
      email: 'maria@exemplo.com',
      links: { self: '/users/1' },
    });
    expect(JSON.stringify(user)).not.toMatch(/password/i);
  });

  it('rejects a duplicated email, ignoring case', async () => {
    await service.create(dto);
    await expect(
      service.create({ ...dto, email: 'MARIA@exemplo.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('finds a user by id and throws when it does not exist', async () => {
    const created = await service.create(dto);
    expect(service.findById(created.id).email).toBe(dto.email);
    expect(() => service.findById(99)).toThrow(NotFoundException);
  });
});
