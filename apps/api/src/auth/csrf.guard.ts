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
import { NO_CSRF_KEY } from './no-csrf.decorator.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Registered globally alongside AuthGuard (see AuthModule). Session-bound
// double submit: the request must carry the same token in the csrf_token
// cookie and the X-CSRF-Token header, and that token's signature must match
// the current session (derived from the access_token cookie) — so a token
// minted for a different session, or before the current one started,
// doesn't validate. Every unsafe method is covered, including @Public()
// routes (login, sign-up): SameSite=Strict alone doesn't stop login CSRF,
// since Set-Cookie on a cross-site POST response is still stored and sent on
// the victim's next same-site navigation. Only an explicit @NoCsrf() (a
// future webhook/machine-to-machine route) is exempt.
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const noCsrf = this.reflector.getAllAndOverride<boolean>(NO_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (noCsrf) return true;

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
