const DEV_SECRET = 'dev-only-secret-change-me';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_SECRET;
}

// Only HS256 is ever used to sign our tokens; pinning it stops a token crafted
// with `alg: none` or a different algorithm from being accepted.
export const JWT_ALGORITHM = 'HS256';

// `Number('')` is 0, not NaN, so an empty-but-present env var would silently
// expire tokens (and the session cookie's Max-Age) instantly; guard against
// both that and a genuinely non-numeric value.
function parseExpiresIn(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (seconds), got ${JSON.stringify(raw)}`);
  }
  return value;
}

// Seconds. The token lifetime and the `expiresIn` in the login response.
export const JWT_EXPIRES_IN_SECONDS = parseExpiresIn(
  'JWT_EXPIRES_IN',
  process.env.JWT_EXPIRES_IN,
  3600,
);

// Used instead of JWT_EXPIRES_IN_SECONDS when the user checks "Lembrar-me".
// The session cookie's Max-Age is derived from this same value in the
// controller, so the cookie and the JWT it holds always expire together —
// letting them diverge produces a "cookie present, token expired" 401 loop.
export const REMEMBER_ME_EXPIRES_IN_SECONDS = parseExpiresIn(
  'REMEMBER_ME_EXPIRES_IN',
  process.env.REMEMBER_ME_EXPIRES_IN,
  7 * 24 * 3600, // 7 days
);
