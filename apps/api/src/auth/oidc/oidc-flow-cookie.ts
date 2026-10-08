import type { Request, Response } from 'express';
import {
  getClearOidcCookieOptions,
  getOidcFlowCookieOptions,
  OIDC_COOKIE_MAX_AGE_MS,
  OIDC_FLOW_COOKIE,
} from '../cookie.constants.js';
import { readCookie } from '../cookies.js';
import type { OidcProvider } from './oidc.constants.js';

export interface OidcFlowState {
  provider: OidcProvider;
  state: string;
  codeVerifier: string;
}

interface OidcFlowPayload extends OidcFlowState {
  exp: number; // epoch ms
}

// httpOnly already keeps page JS and a cross-site reader off this cookie;
// see cookie.constants.ts for why that's enough and no signature is added on
// top. Base64url here is just encoding (JSON wouldn't survive raw in a
// cookie value), not a security boundary.
export function setOidcFlowCookie(res: Response, flow: OidcFlowState): void {
  const payload: OidcFlowPayload = { ...flow, exp: Date.now() + OIDC_COOKIE_MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  res.cookie(OIDC_FLOW_COOKIE, encoded, getOidcFlowCookieOptions());
}

// The cookie's own Max-Age only controls whether the *browser* still sends
// it back — the explicit `exp` check below is the server refusing a stale
// one on its own, per plan/LoginSocial.md ("valida que o state... não
// expirou"), independent of whatever the client did or didn't enforce.
export function readOidcFlowCookie(req: Request): OidcFlowState | undefined {
  const raw = readCookie(req, OIDC_FLOW_COOKIE);
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
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
    // Malformed or tampered — treated the same as no cookie at all.
  }
  return undefined;
}

export function clearOidcFlowCookie(res: Response): void {
  res.clearCookie(OIDC_FLOW_COOKIE, getClearOidcCookieOptions());
}
