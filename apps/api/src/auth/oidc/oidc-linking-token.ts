import { createHmac, timingSafeEqual } from 'node:crypto';
import { getOidcLinkingTokenSecret } from './oidc.constants.js';
import type { OidcProvider } from './oidc.constants.js';

// 3-5 minutes per plan/LoginSocial.md; the upper end, since it has to survive
// the person reading and typing their password on /vincular-conta.
const LINKING_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface LinkingTokenClaims {
  email: string;
  provider: OidcProvider;
  providerSub: string;
}

interface LinkingTokenPayload extends LinkingTokenClaims {
  exp: number; // epoch ms
}

// 'oidc-link:' domain-separates this HMAC from any other use of the same
// secret, same convention as csrf.ts's 'csrf:' prefix.
function sign(encodedPayload: string): string {
  return createHmac('sha256', getOidcLinkingTokenSecret())
    .update(`oidc-link:${encodedPayload}`)
    .digest('base64url');
}

export function mintLinkingToken(claims: LinkingTokenClaims): string {
  const payload: LinkingTokenPayload = { ...claims, exp: Date.now() + LINKING_TOKEN_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

// Any failure — missing, malformed, bad signature, expired — returns
// undefined, deliberately indistinguishable to the caller: OidcController
// turns all of them into the same generic error, so a failed attempt can't
// tell "your password was wrong" apart from "that link already expired".
//
// There is no separate single-use tracking store: a replayed token can only
// ever succeed once in practice, because the second attempt's
// linkProviderIdentity call hits the same @@unique([provider, providerSub])
// constraint the first one already satisfied and fails with a conflict —
// the short expiry plus that constraint is the single-use guarantee, not a
// consumed-token table this app has no Redis/session store to back.
export function verifyLinkingToken(token: string | undefined): LinkingTokenClaims | undefined {
  if (!token) return undefined;
  const [encoded, mac] = token.split('.');
  if (!encoded || !mac) return undefined;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<LinkingTokenPayload>;
    if (
      typeof payload.email !== 'string' ||
      typeof payload.provider !== 'string' ||
      typeof payload.providerSub !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return undefined;
    }
    if (Date.now() > payload.exp) return undefined;
    return { email: payload.email, provider: payload.provider as OidcProvider, providerSub: payload.providerSub };
  } catch {
    return undefined;
  }
}
