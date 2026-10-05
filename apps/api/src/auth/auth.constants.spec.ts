import { describe, expect, it, vi } from 'vitest';

// JWT_EXPIRES_IN_SECONDS is computed at import time, so each case re-imports
// the module fresh with a different env to see its own value.
async function importWithEnv(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('JWT_EXPIRES_IN', value as string);
  if (value === undefined) vi.unstubAllEnvs();
  return import('./auth.constants.js');
}

describe('JWT_EXPIRES_IN_SECONDS', () => {
  it('defaults to 3600 when unset', async () => {
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv(undefined);
    expect(JWT_EXPIRES_IN_SECONDS).toBe(3600);
  });

  it('defaults to 3600 when empty, instead of becoming 0', async () => {
    // Number('') is 0, not NaN: left unguarded this would set a cookie
    // Max-Age of 0, deleting the session cookie the instant it is set.
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv('');
    expect(JWT_EXPIRES_IN_SECONDS).toBe(3600);
  });

  it('accepts a positive integer', async () => {
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv('7200');
    expect(JWT_EXPIRES_IN_SECONDS).toBe(7200);
  });

  it('rejects a non-numeric value instead of becoming NaN', async () => {
    await expect(importWithEnv('abc')).rejects.toThrow(/JWT_EXPIRES_IN/);
  });

  it('rejects zero and negative values', async () => {
    await expect(importWithEnv('0')).rejects.toThrow(/JWT_EXPIRES_IN/);
    await expect(importWithEnv('-10')).rejects.toThrow(/JWT_EXPIRES_IN/);
  });

  it('rejects a non-integer value', async () => {
    await expect(importWithEnv('3.5')).rejects.toThrow(/JWT_EXPIRES_IN/);
  });
});
