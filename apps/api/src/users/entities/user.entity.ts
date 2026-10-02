import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../generated/prisma/client.js';

// Database record read by UsersService. Never sent to clients.
export type StoredUser = User;

export class UserLinks {
  @ApiProperty({ example: '/users/1' })
  self: string;
}

// Response representation: no password data.
export class UserEntity {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  email: string;

  @ApiProperty({ example: '2026-10-02T12:00:00.000Z', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: UserLinks })
  links: UserLinks;

  constructor(user: StoredUser) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.createdAt = user.createdAt.toISOString();
    this.links = { self: `/users/${user.id}` };
  }
}
