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

const DEFAULT_JWT_EXPIRES_IN_SECONDS = 3600;

// Seconds. The token lifetime and the `expiresIn` in the login response.
// `Number('')` is 0, not NaN, so an empty JWT_EXPIRES_IN would silently expire
// tokens (and the session cookie's Max-Age) instantly; guard against both.
function parseExpiresIn(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `JWT_EXPIRES_IN must be a positive integer (seconds), got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

export const JWT_EXPIRES_IN_SECONDS = parseExpiresIn(process.env.JWT_EXPIRES_IN);
