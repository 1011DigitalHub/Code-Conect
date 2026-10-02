import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { UserEntity } from './entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  const usersService = { create: vi.fn() };

  beforeEach(async () => {
    usersService.create.mockResolvedValue(
      new UserEntity({
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        passwordHash: 'salt:hash',
        createdAt: new Date(),
      }),
    );
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();
    controller = module.get(UsersController);
  });

  it('creates a user and sets the Location header', async () => {
    const location = vi.fn();
    const res = { location } as unknown as Response;
    const dto = {
      name: 'Maria',
      email: 'maria@exemplo.com',
      password: 'senha-12345',
    };
    const user = await controller.create(dto, res);
    expect(usersService.create).toHaveBeenCalledWith(dto);
    expect(user.id).toBe(1);
    expect(location).toHaveBeenCalledWith('/users/1');
  });
});
