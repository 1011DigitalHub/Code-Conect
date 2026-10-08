import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, shouldRehash, verifyUserPassword } from '../users/password.js';
import { UsersService } from '../users/users.service.js';
import { JWT_EXPIRES_IN_SECONDS, REMEMBER_ME_EXPIRES_IN_SECONDS } from './auth.constants.js';
import type { JwtPayload, SignInResult } from './auth.types.js';

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
  ): Promise<SignInResult> {
    const user = await this.usersService.findByEmail(email);
    // Always runs verifyPassword, real hash or DUMMY_HASH: short-circuiting
    // on !user would skip the scrypt call entirely for an unknown email,
    // making it respond measurably faster than a wrong password for a real
    // one — the same 401 message doesn't help if the timing still gives it
    // away. Both branches cost one scrypt call either way. The same
    // DUMMY_HASH fallback also covers a user that exists but has no local
    // password at all (an account created via OIDC — see
    // plan/LoginSocial.md) without a separate check: verifyUserPassword
    // already can't succeed against a null hash.
    const passwordIsValid = await verifyUserPassword(user, password);
    if (!user || !passwordIsValid) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Migrates an account to the current scrypt cost on its next
    // successful login, instead of forcing a password reset. Best-effort:
    // a failure here must never block the login that already succeeded.
    // user.passwordHash is only null for an OIDC-only account, which can
    // never reach this line: passwordIsValid is false against DUMMY_HASH
    // for it, so the throw above already returned. The check is still here
    // because TypeScript can't see that runtime guarantee from the type of
    // passwordHash alone.
    if (user.passwordHash && shouldRehash(user.passwordHash)) {
      await this.usersService.updatePasswordHash(user.id, await hashPassword(password));
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
