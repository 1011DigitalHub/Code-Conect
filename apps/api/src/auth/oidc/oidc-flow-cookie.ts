import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  getClearOidcFlowCookieOptions,
  getOidcFlowCookieOptions,
  OIDC_COOKIE_MAX_AGE_MS,
  OIDC_FLOW_COOKIE,
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

// See cookie.constants.ts's doc comment on OIDC_FLOW_COOKIE for why this is
// signed: without it, a sibling subdomain able to set this cookie (under a
// shared parent COOKIE_DOMAIN) could inject a self-consistent
// {state, codeVerifier} of its own and turn that into a login CSRF. Base64url
// here is just encoding — the signature below is the actual boundary.
export function setOidcFlowCookie(res: Response, flow: OidcFlowState): void {
  const payload: OidcFlowPayload = { ...flow, exp: Date.now() + OIDC_COOKIE_MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  res.cookie(OIDC_FLOW_COOKIE, `${encoded}.${sign(encoded)}`, getOidcFlowCookieOptions());
}

// The cookie's own Max-Age only controls whether the *browser* still sends
// it back — the explicit `exp` check below is the server refusing a stale
// one on its own, per plan/LoginSocial.md ("valida que o state... não
// expirou"), independent of whatever the client did or didn't enforce.
export function readOidcFlowCookie(req: Request): OidcFlowState | undefined {
  const raw = readCookie(req, OIDC_FLOW_COOKIE);
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
  res.clearCookie(OIDC_FLOW_COOKIE, getClearOidcFlowCookieOptions());
}
