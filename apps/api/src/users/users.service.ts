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

  // The one place passwordHash is read: login needs it to verify the
  // password, so this explicitly opts back in to the field the global omit
  // (see PrismaService) hides everywhere else.
  findByEmail(email: string): Promise<StoredUser | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      omit: { passwordHash: false },
    });
  }

  // No override: passwordHash stays omitted. GET /auth/me (the caller)
  // never needed it — this used to load it into memory on every call anyway.
  async findById(id: number): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return new UserEntity(user);
  }

  // Called by AuthService after a successful login when password.ts's
  // shouldRehash() flags the stored hash as using outdated cost parameters,
  // so accounts migrate to the current cost without a forced password reset.
  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  // The first lookup OidcService.resolveIdentity does on every OIDC
  // callback: does this exact (provider, sub) already map to a user? No
  // passwordHash override needed — OIDC sign-in never checks a local
  // password.
  findByProviderIdentity(provider: string, providerSub: string): Promise<StoredUser | null> {
    return this.prisma.user.findFirst({
      where: { identities: { some: { provider, providerSub } } },
    });
  }

  // A brand-new account from a first-time OIDC sign-in: no passwordHash at
  // all (not even a random one — AuthService.signIn's DUMMY_HASH fallback
  // already makes a null hash behave exactly like a wrong password), and
  // the identity row created in the same write so the two can never exist
  // one without the other.
  async createFromOidc(params: {
    name: string;
    email: string;
    provider: string;
    providerSub: string;
  }): Promise<StoredUser> {
    return this.prisma.user.create({
      data: {
        name: params.name,
        email: params.email,
        passwordHash: null,
        identities: { create: { provider: params.provider, providerSub: params.providerSub } },
      },
    });
  }

  // Attaches a provider identity to an existing user — either the
  // no-password-confirmation-needed auto-link (an OIDC-only account adding a
  // second provider) or the password-confirmed manual link from POST
  // /auth/oidc/link. The @@unique([provider, providerSub]) constraint is
  // the actual single-use guarantee for a replayed linking_token (see
  // oidc-linking-token.ts) — a second attempt lands here and conflicts.
  async linkProviderIdentity(userId: number, provider: string, providerSub: string): Promise<void> {
    try {
      await this.prisma.oidcIdentity.create({ data: { userId, provider, providerSub } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Identidade já vinculada a uma conta');
      }
      throw error;
    }
  }
}
