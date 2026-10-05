import { describe, expect, it, vi } from 'vitest';

// Both *_EXPIRES_IN_SECONDS constants are computed at import time, so each
// case re-imports the module fresh with a different env to see its own value.
async function importWithEnv(
  vars: Partial<Record<'JWT_EXPIRES_IN' | 'REMEMBER_ME_EXPIRES_IN', string>>,
) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
  return import('./auth.constants.js');
}

describe('JWT_EXPIRES_IN_SECONDS', () => {
  it('defaults to 3600 when unset', async () => {
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv({});
    expect(JWT_EXPIRES_IN_SECONDS).toBe(3600);
  });

  it('defaults to 3600 when empty, instead of becoming 0', async () => {
    // Number('') is 0, not NaN: left unguarded this would set a cookie
    // Max-Age of 0, deleting the session cookie the instant it is set.
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv({ JWT_EXPIRES_IN: '' });
    expect(JWT_EXPIRES_IN_SECONDS).toBe(3600);
  });

  it('accepts a positive integer', async () => {
    const { JWT_EXPIRES_IN_SECONDS } = await importWithEnv({ JWT_EXPIRES_IN: '7200' });
    expect(JWT_EXPIRES_IN_SECONDS).toBe(7200);
  });

  it('rejects a non-numeric value instead of becoming NaN', async () => {
    await expect(importWithEnv({ JWT_EXPIRES_IN: 'abc' })).rejects.toThrow(
      /JWT_EXPIRES_IN/,
    );
  });

  it('rejects zero and negative values', async () => {
    await expect(importWithEnv({ JWT_EXPIRES_IN: '0' })).rejects.toThrow(
      /JWT_EXPIRES_IN/,
    );
    await expect(importWithEnv({ JWT_EXPIRES_IN: '-10' })).rejects.toThrow(
      /JWT_EXPIRES_IN/,
    );
  });

  it('rejects a non-integer value', async () => {
    await expect(importWithEnv({ JWT_EXPIRES_IN: '3.5' })).rejects.toThrow(
      /JWT_EXPIRES_IN/,
    );
  });
});

describe('REMEMBER_ME_EXPIRES_IN_SECONDS', () => {
  it('defaults to 7 days when unset', async () => {
    const { REMEMBER_ME_EXPIRES_IN_SECONDS } = await importWithEnv({});
    expect(REMEMBER_ME_EXPIRES_IN_SECONDS).toBe(7 * 24 * 3600);
  });

  it('accepts a positive integer override', async () => {
    const { REMEMBER_ME_EXPIRES_IN_SECONDS } = await importWithEnv({
      REMEMBER_ME_EXPIRES_IN: '86400',
    });
    expect(REMEMBER_ME_EXPIRES_IN_SECONDS).toBe(86400);
  });

  it('rejects a non-numeric value', async () => {
    await expect(
      importWithEnv({ REMEMBER_ME_EXPIRES_IN: 'abc' }),
    ).rejects.toThrow(/REMEMBER_ME_EXPIRES_IN/);
  });
});
