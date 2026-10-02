const DEV_SECRET = 'dev-only-secret-change-me';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_SECRET;
}

// Seconds. The token lifetime and the `expiresIn` in the login response.
export const JWT_EXPIRES_IN_SECONDS = Number(
  process.env.JWT_EXPIRES_IN ?? 3600,
);
