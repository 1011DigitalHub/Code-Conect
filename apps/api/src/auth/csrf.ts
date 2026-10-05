import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './auth.constants.js';

// Falls back to the JWT secret so configuring CSRF is optional, but a
// dedicated CSRF_SECRET is preferred for key separation. Called per use
// (never captured in a module-level const), so tests can stub the env.
function getCsrfSecret(): string {
  return process.env.CSRF_SECRET || getJwtSecret();
}

// Binds a CSRF token to the current session by hashing the access-token
// cookie, so a token minted for one session (or for an anonymous visitor)
// never validates for another. Reads the raw cookie rather than
// request.user, so this works no matter which guard runs first.
export function sessionKey(accessToken: string | undefined): string {
  return accessToken
    ? createHash('sha256').update(accessToken).digest('base64url')
    : 'anon';
}

// 'csrf:' domain-separates this HMAC from any other use of the same secret.
function sign(nonce: string, key: string): string {
  return createHmac('sha256', getCsrfSecret())
    .update(`csrf:${nonce}:${key}`)
    .digest('base64url');
}

export function mintCsrfToken(key: string): string {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${sign(nonce, key)}`;
}

export function verifyCsrfToken(token: string | undefined, key: string): boolean {
  const [nonce, mac] = token?.split('.') ?? [];
  if (!nonce || !mac) return false;
  const expected = Buffer.from(sign(nonce, key));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
