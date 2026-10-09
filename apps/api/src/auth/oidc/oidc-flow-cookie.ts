import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  getClearOidcFlowCookieOptions,
  getOidcFlowCookieName,
  getOidcFlowCookieOptions,
  OIDC_COOKIE_MAX_AGE_MS,
} from '../cookie.constants.js';
import { readCookie } from '../cookies.js';
import { getOidcLinkingTokenSecret } from './oidc.constants.js';
import type { OidcProvider } from './oidc.constants.js';

export interface OidcFlowState {
  provider: OidcProvider;
  state: string;
  codeVerifier: string;
}

interface OidcFlowPayload extends OidcFlowState {
  exp: number; // epoch ms
}

// 'oidc-flow:' domain-separates this HMAC from oidc-linking-token.ts's own
// use of the same secret, same convention as csrf.ts's 'csrf:' prefix.
function sign(encodedPayload: string): string {
  return createHmac('sha256', getOidcLinkingTokenSecret())
    .update(`oidc-flow:${encodedPayload}`)
    .digest('base64url');
}

// Signed so a forged payload can't pass; see cookie.constants.ts's doc
// comment above useHostPrefix() for the login-CSRF this alone does NOT
// stop (a legitimately-signed cookie injected from a sibling subdomain) and
// why getOidcFlowCookieName()'s __Host- prefix is the actual fix for that
// one. Base64url here is just encoding — the signature is what the
// malformed/tampered checks below actually rely on.
export function setOidcFlowCookie(res: Response, flow: OidcFlowState): void {
  const payload: OidcFlowPayload = { ...flow, exp: Date.now() + OIDC_COOKIE_MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  res.cookie(getOidcFlowCookieName(), `${encoded}.${sign(encoded)}`, getOidcFlowCookieOptions());
}

// The cookie's own Max-Age only controls whether the *browser* still sends
// it back — the explicit `exp` check below is the server refusing a stale
// one on its own, per plan/LoginSocial.md ("valida que o state... não
// expirou"), independent of whatever the client did or didn't enforce.
export function readOidcFlowCookie(req: Request): OidcFlowState | undefined {
  const raw = readCookie(req, getOidcFlowCookieName());
  if (!raw) return undefined;

  const [encoded, mac] = raw.split('.');
  if (!encoded || !mac) return undefined;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as OidcFlowPayload).provider === 'string' &&
      typeof (parsed as OidcFlowPayload).state === 'string' &&
      typeof (parsed as OidcFlowPayload).codeVerifier === 'string' &&
      typeof (parsed as OidcFlowPayload).exp === 'number'
    ) {
      const { provider, state, codeVerifier, exp } = parsed as OidcFlowPayload;
      if (Date.now() > exp) return undefined;
      return { provider, state, codeVerifier };
    }
  } catch {
    // Malformed — treated the same as no cookie at all.
  }
  return undefined;
}

export function clearOidcFlowCookie(res: Response): void {
  res.clearCookie(getOidcFlowCookieName(), getClearOidcFlowCookieOptions());
}
