import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { StoredUser, UserEntity } from './entities/user.entity.js';
import { hashPassword } from './password.js';

// Prisma error code for a unique constraint violation.
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash: await hashPassword(dto.password),
        },
      });
      return new UserEntity(user);
    } catch (error) {
      // The unique index on email decides, so two concurrent sign-ups with the
      // same email can't both succeed.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Email já cadastrado');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<StoredUser | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: number): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return new UserEntity(user);
  }
}
