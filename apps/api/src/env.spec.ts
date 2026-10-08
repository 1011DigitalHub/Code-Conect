import { afterEach, describe, expect, it, vi } from 'vitest';

// Every value is computed once at import time, so each case clears the
// module cache and re-imports with a fresh env, the same pattern used in
// auth.constants.spec.ts.
const REQUIRED = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

// OIDC_LINKING_TOKEN_SECRET is the one OIDC var this file's production
// requirements add (see env.ts) — needed by any test here that sets
// NODE_ENV: 'production' and expects successful validation, same reasoning
// as JWT_SECRET/CORS_ORIGINS above. API_ORIGIN/WEB_APP_ORIGIN and the OIDC
// client credentials are deliberately NOT required in production (OIDC is
// an optional login method on top of the password one), so no var for
// those needs to go here.
const PRODUCTION_OIDC_VARS = {
  OIDC_LINKING_TOKEN_SECRET: 'b'.repeat(32),
};

async function importWithEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({ ...REQUIRED, ...vars })) {
    vi.stubEnv(key, value as string);
  }
  return import('./env.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('env', () => {
  it('accepts a minimal valid development configuration', async () => {
    const { env } = await importWithEnv({ JWT_SECRET: undefined, CORS_ORIGINS: undefined });
    expect(env.nodeEnv).toBe('development');
    expect(env.isProduction).toBe(false);
    expect(env.port).toBe(3000);
    expect(env.swaggerEnabled).toBe(true);
    expect(env.trustProxy).toBe(0);
  });

  it('rejects a missing NODE_ENV', async () => {
    await expect(importWithEnv({ NODE_ENV: undefined })).rejects.toThrow(/NODE_ENV/);
  });

  it('rejects an unrecognized NODE_ENV', async () => {
    await expect(importWithEnv({ NODE_ENV: 'prod' })).rejects.toThrow(/NODE_ENV/);
  });

  it('rejects a missing DATABASE_URL', async () => {
    await expect(importWithEnv({ DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL with the wrong scheme', async () => {
    await expect(importWithEnv({ DATABASE_URL: 'mysql://x' })).rejects.toThrow(/DATABASE_URL/);
  });

  it('requires JWT_SECRET in production', async () => {
    await expect(
      importWithEnv({ NODE_ENV: 'production', JWT_SECRET: undefined, CORS_ORIGINS: 'https://a.com' }),
    ).rejects.toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', async () => {
    await expect(importWithEnv({ JWT_SECRET: 'too-short' })).rejects.toThrow(/JWT_SECRET/);
  });

  it('requires a non-empty CORS_ORIGINS in production', async () => {
    await expect(
      importWithEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        CORS_ORIGINS: undefined,
      }),
    ).rejects.toThrow(/CORS_ORIGINS/);
  });

  it('allows an empty CORS_ORIGINS outside production (defaults to the dev origins)', async () => {
    const { env } = await importWithEnv({ CORS_ORIGINS: undefined });
    expect(env.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5174']);
  });

  it('rejects a non-integer TRUST_PROXY', async () => {
    await expect(importWithEnv({ TRUST_PROXY: 'abc' })).rejects.toThrow(/TRUST_PROXY/);
  });

  it('rejects a negative TRUST_PROXY', async () => {
    await expect(importWithEnv({ TRUST_PROXY: '-1' })).rejects.toThrow(/TRUST_PROXY/);
  });

  it('accepts a positive TRUST_PROXY hop count', async () => {
    const { env } = await importWithEnv({ TRUST_PROXY: '1' });
    expect(env.trustProxy).toBe(1);
  });

  it('rejects a non-boolean SWAGGER_ENABLED', async () => {
    await expect(importWithEnv({ SWAGGER_ENABLED: 'yes' })).rejects.toThrow(/SWAGGER_ENABLED/);
  });

  it('defaults swaggerEnabled to false in production', async () => {
    const { env } = await importWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      CORS_ORIGINS: 'https://a.com',
      SWAGGER_ENABLED: undefined,
      ...PRODUCTION_OIDC_VARS,
    });
    expect(env.swaggerEnabled).toBe(false);
  });

  it('rejects a non-boolean COOKIE_SECURE', async () => {
    await expect(importWithEnv({ COOKIE_SECURE: 'yep' })).rejects.toThrow(/COOKIE_SECURE/);
  });

  it('rejects an unrecognized COOKIE_SAMESITE', async () => {
    await expect(importWithEnv({ COOKIE_SAMESITE: 'loose' })).rejects.toThrow(/COOKIE_SAMESITE/);
  });

  it('rejects a non-numeric JWT_EXPIRES_IN', async () => {
    await expect(importWithEnv({ JWT_EXPIRES_IN: 'abc' })).rejects.toThrow(/JWT_EXPIRES_IN/);
  });

  it('defaults API_ORIGIN/WEB_APP_ORIGIN to the dev origins, even in production (OIDC is optional)', async () => {
    const { env } = await importWithEnv({ API_ORIGIN: undefined, WEB_APP_ORIGIN: undefined });
    expect(env.apiOrigin).toBe('http://localhost:3000');
    expect(env.webAppOrigin).toBe('http://localhost:5173');

    const prod = await importWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      CORS_ORIGINS: 'https://a.com',
      ...PRODUCTION_OIDC_VARS,
      API_ORIGIN: undefined,
      WEB_APP_ORIGIN: undefined,
    });
    expect(prod.env.apiOrigin).toBe('http://localhost:3000');
    expect(prod.env.webAppOrigin).toBe('http://localhost:5173');
  });

  it('allows empty OIDC client credentials, even in production — the buttons just fail at the provider', async () => {
    const { env } = await importWithEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      MICROSOFT_CLIENT_ID: undefined,
      MICROSOFT_CLIENT_SECRET: undefined,
    });
    expect(env.googleClientId).toBe('');
    expect(env.microsoftClientSecret).toBe('');

    const prod = await importWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      CORS_ORIGINS: 'https://a.com',
      ...PRODUCTION_OIDC_VARS,
      GOOGLE_CLIENT_ID: undefined,
      MICROSOFT_CLIENT_SECRET: undefined,
    });
    expect(prod.env.googleClientId).toBe('');
    expect(prod.env.microsoftClientSecret).toBe('');
  });

  it('requires OIDC_LINKING_TOKEN_SECRET in production, never falling back to JWT_SECRET', async () => {
    await expect(
      importWithEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        CORS_ORIGINS: 'https://a.com',
        ...PRODUCTION_OIDC_VARS,
        OIDC_LINKING_TOKEN_SECRET: undefined,
      }),
    ).rejects.toThrow(/OIDC_LINKING_TOKEN_SECRET/);
  });

  it('rejects an OIDC_LINKING_TOKEN_SECRET shorter than 32 characters', async () => {
    await expect(importWithEnv({ OIDC_LINKING_TOKEN_SECRET: 'too-short' })).rejects.toThrow(
      /OIDC_LINKING_TOKEN_SECRET/,
    );
  });

  it('aggregates every error into one message instead of stopping at the first', async () => {
    await expect(
      importWithEnv({
        NODE_ENV: 'nonsense',
        DATABASE_URL: undefined,
        TRUST_PROXY: 'abc',
      }),
    ).rejects.toThrow(/NODE_ENV[\s\S]*DATABASE_URL[\s\S]*TRUST_PROXY|TRUST_PROXY[\s\S]*NODE_ENV/);
  });
});
