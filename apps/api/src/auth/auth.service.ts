import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyPassword } from '../users/password.js';
import { UsersService } from '../users/users.service.js';
import { JWT_EXPIRES_IN_SECONDS, REMEMBER_ME_EXPIRES_IN_SECONDS } from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import { TokenResponseDto } from './dto/token-response.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(
    email: string,
    password: string,
    remember = false,
  ): Promise<TokenResponseDto> {
    const user = await this.usersService.findByEmail(email);
    // Same message for unknown email and wrong password.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }
    const payload: JwtPayload = { sub: user.id, email: user.email };
    // "Lembrar-me" extends the token's own lifetime, not just the cookie's:
    // the session cookie's Max-Age (set in the controller) mirrors this same
    // value, so the cookie and the token it holds always expire together.
    const expiresIn = remember ? REMEMBER_ME_EXPIRES_IN_SECONDS : JWT_EXPIRES_IN_SECONDS;
    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn }),
      tokenType: 'Bearer',
      expiresIn,
    };
  }
}
