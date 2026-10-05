import type { Request } from 'express';

export interface JwtPayload {
  sub: number;
  email: string;
}

// Set by AuthGuard only when the route isn't @Public(); request.user is
// genuinely absent on a public route, so don't widen this to make it easy.
export type MaybeAuthenticatedRequest = Request & { user?: JwtPayload };

// Use this type only in a handler that is behind the (global) AuthGuard.
export type AuthenticatedRequest = Request & { user: JwtPayload };
