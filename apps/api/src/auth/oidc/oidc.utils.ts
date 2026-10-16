import type { Request, Response } from 'express';
import {
  getClearLinkingTokenCookieOptions,
  getLinkingTokenCookieName,
  getLinkingTokenCookieOptions,
} from '../cookie.constants.js';
import { readCookie } from '../cookies.js';

export function setLinkingTokenCookie(res: Response, token: string): void {
  res.cookie(getLinkingTokenCookieName(), token, getLinkingTokenCookieOptions());
}

export function clearLinkingTokenCookie(res: Response): void {
  res.clearCookie(getLinkingTokenCookieName(), getClearLinkingTokenCookieOptions());
}

export function readLinkingTokenCookie(req: Request): string | undefined {
  return readCookie(req, getLinkingTokenCookieName());
}
