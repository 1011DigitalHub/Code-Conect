import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { StoredUser, UserEntity } from './entities/user.entity.js';
import { hashPassword } from './password.js';

@Injectable()
export class UsersService {
  // In-memory storage until a database is added. Data is lost on restart.
  private readonly users: StoredUser[] = [];
  private nextId = 1;

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const email = dto.email.toLowerCase();
    if (this.findByEmail(email)) {
      throw new ConflictException('Email já cadastrado');
    }
    const user: StoredUser = {
      id: this.nextId++,
      name: dto.name,
      email,
      passwordHash: await hashPassword(dto.password),
      createdAt: new Date(),
    };
    this.users.push(user);
    return new UserEntity(user);
  }

  findByEmail(email: string): StoredUser | undefined {
    const normalized = email.toLowerCase();
    return this.users.find((user) => user.email === normalized);
  }

  findById(id: number): UserEntity {
    const user = this.users.find((item) => item.id === id);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return new UserEntity(user);
  }
}
