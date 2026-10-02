import type { Request } from 'express';

export interface JwtPayload {
  sub: number;
  email: string;
}

export type AuthenticatedRequest = Request & { user: JwtPayload };
