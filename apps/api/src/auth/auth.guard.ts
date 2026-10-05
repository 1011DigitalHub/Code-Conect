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

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
