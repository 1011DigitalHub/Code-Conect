import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } from './cookie.constants.js';
import { readCookie } from './cookies.js';
import { sessionKey, verifyCsrfToken } from './csrf.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { NO_CSRF_KEY } from './no-csrf.decorator.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Registered globally alongside AuthGuard (see AuthModule). Session-bound
// double submit: the request must carry the same token in the csrf_token
// cookie and the X-CSRF-Token header, and that token's signature must match
// the current session (derived from the access_token cookie) — so a token
// minted for a different session, or before the current one started,
// doesn't validate.
//
// Bridge phase: a @Public() route is exempt for now, because the web app
// doesn't send the header until it adopts the cookie session. That exemption
// is removed in a later commit, once the web switches; from then on every
// unsafe method is covered except an explicit @NoCsrf().
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const metadata = (key: string) =>
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (metadata(NO_CSRF_KEY)) return true;
    if (metadata(IS_PUBLIC_KEY)) return true; // bridge phase, see above

    const key = sessionKey(readCookie(request, ACCESS_TOKEN_COOKIE));
    const cookieToken = readCookie(request, CSRF_COOKIE);
    const headerToken = request.headers[CSRF_HEADER] as string | undefined;

    const valid =
      !!cookieToken &&
      !!headerToken &&
      cookieToken === headerToken &&
      verifyCsrfToken(cookieToken, key);
    if (!valid) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
