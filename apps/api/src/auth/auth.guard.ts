import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { getJwtSecret, JWT_ALGORITHM } from './auth.constants.js';
import { ACCESS_TOKEN_COOKIE } from './cookie.constants.js';
import { readCookie } from './cookies.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { JwtPayload, MaybeAuthenticatedRequest } from './auth.types.js';

// Registered globally (see AppModule): every route is protected by default,
// and a route must opt out explicitly with @Public(). This is the fail-safe
// default the rest of the app relies on — a new endpoint that forgets a
// decorator stays protected instead of accidentally becoming public.
//
// A @Public() route is *optionally* authenticated: the guard still tries to
// read the session and populates request.user when it finds a valid one, but
// never rejects. That is what lets the public feed say whether *you* already
// liked each post without a second guard, and without the feed having to be
// protected. On a public route an absent, malformed or expired cookie simply
// means "not logged in", so it is ignored rather than raised.
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

    const request = context.switchToHttp().getRequest<MaybeAuthenticatedRequest>();
    // The session lives only in the httpOnly access_token cookie now; the
    // Authorization: Bearer bridge that used to fall back to is retired.
    const token = readCookie(request, ACCESS_TOKEN_COOKIE);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: getJwtSecret(),
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }
    return true;
  }
}
