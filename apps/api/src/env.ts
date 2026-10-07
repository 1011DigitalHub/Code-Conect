// Validated once, at import time, and imported first in main.ts (right after
// ./load-env.js) so a bad .env fails the boot with one clear message instead
// of surfacing as a confusing failure on the first request. Every check here
// aggregates its error instead of throwing immediately, so a broken .env
// reports everything wrong with it in one pass, not one variable at a time.

export type NodeEnv = 'development' | 'test' | 'production';
type SameSite = 'strict' | 'lax' | 'none';

const errors: string[] = [];

function readNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV;
  if (raw === 'development' || raw === 'test' || raw === 'production') return raw;
  if (raw === undefined) {
    errors.push(
      'NODE_ENV must be set to "development", "test" or "production" (it decides whether the JWT secret, the Secure cookie flag and the CORS allowlist default to their safe production behaviour)',
    );
  } else {
    errors.push(`NODE_ENV must be "development", "test" or "production", got ${JSON.stringify(raw)}`);
  }
  return 'development';
}

const nodeEnv = readNodeEnv();
const isProduction = nodeEnv === 'production';

function readDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    errors.push('DATABASE_URL must be set (see apps/api/.env.example)');
    return '';
  }
  if (!raw.startsWith('postgresql://') && !raw.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }
  return raw;
}

function readCorsOrigins(): string[] {
  const DEV_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5174';
  const raw = process.env.CORS_ORIGINS ?? (isProduction ? '' : DEV_ORIGINS);
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (isProduction && origins.length === 0) {
    errors.push(
      'CORS_ORIGINS must list at least one origin in production (an empty list means every browser is refused, and with the session now in a credentialed cookie that silently breaks login instead of failing at boot)',
    );
  }
  return origins;
}

function readJwtSecret(): string {
  const DEV_SECRET = 'dev-only-secret-change-me';
  const raw = process.env.JWT_SECRET;
  if (raw) {
    if (raw.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters');
    }
    return raw;
  }
  if (isProduction) {
    errors.push('JWT_SECRET must be set in production');
    return '';
  }
  return DEV_SECRET;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${name} must be a positive integer (seconds), got ${JSON.stringify(raw)}`);
    return fallback;
  }
  return value;
}

function readSameSite(): SameSite {
  const raw = process.env.COOKIE_SAMESITE?.toLowerCase();
  if (raw === undefined || raw === '') return 'strict';
  if (raw === 'strict' || raw === 'lax' || raw === 'none') return raw;
  errors.push(`COOKIE_SAMESITE must be "strict", "lax" or "none", got ${JSON.stringify(raw)}`);
  return 'strict';
}

function readCookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE;
  if (raw === undefined || raw === '') return isProduction;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  errors.push(`COOKIE_SECURE must be "true" or "false", got ${JSON.stringify(raw)}`);
  return isProduction;
}

// Number of hops to a trusted reverse proxy, for Express's `trust proxy`
// setting (used by the rate limiter to find the real client IP). Never
// `true`: that trusts the entire X-Forwarded-For chain, so any client could
// spoof its own IP by sending one and bypass the limiter entirely — the
// opposite of the point. Unset means "no proxy" (0 hops: trust nothing).
function readTrustProxy(): number {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`TRUST_PROXY must be a non-negative integer (hop count), got ${JSON.stringify(raw)}`);
    return 0;
  }
  return value;
}

function readSwaggerEnabled(): boolean {
  const raw = process.env.SWAGGER_ENABLED;
  if (raw === undefined || raw === '') return !isProduction;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  errors.push(`SWAGGER_ENABLED must be "true" or "false", got ${JSON.stringify(raw)}`);
  return !isProduction;
}

const parsed = {
  nodeEnv,
  isProduction,
  port: readPositiveInt('PORT', 3000),
  databaseUrl: readDatabaseUrl(),
  corsOrigins: readCorsOrigins(),
  jwtSecret: readJwtSecret(),
  jwtExpiresInSeconds: readPositiveInt('JWT_EXPIRES_IN', 3600),
  rememberMeExpiresInSeconds: readPositiveInt('REMEMBER_ME_EXPIRES_IN', 7 * 24 * 3600),
  cookieSecure: readCookieSecure(),
  cookieSameSite: readSameSite(),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  csrfSecret: process.env.CSRF_SECRET || undefined,
  trustProxy: readTrustProxy(),
  swaggerEnabled: readSwaggerEnabled(),
};

if (errors.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n- ${errors.join('\n- ')}\n\nSee apps/api/.env.example.`,
  );
}

export const env = Object.freeze(parsed);
