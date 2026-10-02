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

  it('never uses a wildcard or credentials, and exposes Location and Retry-After', () => {
    const options = getCorsOptions();
    expect(options.origin).not.toContain('*');
    expect(options.credentials).toBe(false);
    expect(options.exposedHeaders).toEqual(['Location', 'Retry-After']);
  });
});
