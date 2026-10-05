import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getJwtSecret, JWT_ALGORITHM } from './auth.constants.js';
import { ACCESS_TOKEN_COOKIE } from './cookie.constants.js';
import { readCookie } from './cookies.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { JwtPayload, MaybeAuthenticatedRequest } from './auth.types.js';

// Registered globally (see AuthModule): every route is protected by default,
// and a route must opt out explicitly with @Public(). This is the fail-safe
// default the rest of the app relies on — a new endpoint that forgets a
// decorator stays protected instead of accidentally becoming public.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<MaybeAuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: getJwtSecret(),
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  // Bridge phase: prefer the httpOnly session cookie, fall back to the
  // Authorization header. The Bearer path is temporary — it exists only so
  // the API and the web app don't have to switch in the same commit — and
  // is removed once the web app moves to the cookie (see CLAUDE.md).
  private extractToken(request: Request): string | undefined {
    const fromCookie = readCookie(request, ACCESS_TOKEN_COOKIE);
    if (fromCookie) return fromCookie;
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
