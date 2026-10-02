import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();
    controller = module.get(UsersController);
  });

  it('creates a user and sets the Location header', async () => {
    const location = vi.fn();
    const res = { location } as unknown as Response;
    const user = await controller.create(
      { name: 'Maria', email: 'maria@exemplo.com', password: 'senha-12345' },
      res,
    );
    expect(user.id).toBe(1);
    expect(location).toHaveBeenCalledWith('/users/1');
  });
});
