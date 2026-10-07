import { afterEach, vi } from 'vitest';
import { getCorsOptions, getCorsOrigins } from './cors.js';

describe('cors', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the Vite origins by default in development', () => {
    vi.stubEnv('CORS_ORIGINS', undefined as unknown as string);
    vi.stubEnv('NODE_ENV', 'development');
    expect(getCorsOrigins()).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5174',
    ]);
  });

  it('parses CORS_ORIGINS, ignoring spaces and empty items', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      ' https://a.exemplo.com , ,https://b.exemplo.com,',
    );
    expect(getCorsOrigins()).toEqual([
      'https://a.exemplo.com',
      'https://b.exemplo.com',
    ]);
  });

  it('allows no origin in production without CORS_ORIGINS', () => {
    vi.stubEnv('CORS_ORIGINS', undefined as unknown as string);
    vi.stubEnv('NODE_ENV', 'production');
    expect(getCorsOrigins()).toEqual([]);
  });

  it('never uses a wildcard, and allows credentials only for the listed origins', () => {
    const options = getCorsOptions();
    expect(options.origin).not.toContain('*');
    expect(options.credentials).toBe(true);
    expect(options.exposedHeaders).toEqual(['Location', 'Retry-After']);
  });

  it('allows the csrf header alongside content-type, and no longer allows Authorization', () => {
    const options = getCorsOptions();
    expect(options.allowedHeaders).toContain('X-CSRF-Token');
    expect(options.allowedHeaders).toContain('Content-Type');
    // The Bearer bridge is gone: the session travels only in the cookie now.
    expect(options.allowedHeaders).not.toContain('Authorization');
  });
});
