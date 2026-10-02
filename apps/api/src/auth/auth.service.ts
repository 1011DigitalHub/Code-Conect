import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyPassword } from '../users/password.js';
import { UsersService } from '../users/users.service.js';
import { JWT_EXPIRES_IN_SECONDS } from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import { TokenResponseDto } from './dto/token-response.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(email: string, password: string): Promise<TokenResponseDto> {
    const user = this.usersService.findByEmail(email);
    // Same message for unknown email and wrong password.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }
}
