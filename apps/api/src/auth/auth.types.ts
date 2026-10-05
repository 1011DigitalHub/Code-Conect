import type { Request } from 'express';

export interface JwtPayload {
  sub: number;
  email: string;
}

// Internal to the auth module: the controller needs the raw accessToken to
// set the session cookie and mint the matching csrf_token, but it must never
// reach the HTTP response body (see LoginResponseDto, which omits it).
export interface SignInResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

// Set by AuthGuard only when the route isn't @Public(); request.user is
// genuinely absent on a public route, so don't widen this to make it easy.
export type MaybeAuthenticatedRequest = Request & { user?: JwtPayload };

// Use this type only in a handler that is behind the (global) AuthGuard.
export type AuthenticatedRequest = Request & { user: JwtPayload };
