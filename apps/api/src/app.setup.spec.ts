import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, describe, expect, it, vi } from 'vitest';

// TRUST_PROXY is read from env.ts, frozen at that module's import time, so
// each case resets the module graph and re-imports both env.ts and
// app.setup.ts fresh to pick up a different value — the same pattern used
// for the other env-dependent specs.
async function configuredAppWithTrustProxy(trustProxy: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
  vi.stubEnv('TRUST_PROXY', trustProxy as string);

  const { AppController } = await import('./app.controller.js');
  const { AppService } = await import('./app.service.js');
  const { configureApp } = await import('./app.setup.js');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [AppService],
  }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

describe('configureApp: trust proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves trust proxy unset (false) when TRUST_PROXY is 0 or unset', async () => {
    const app = await configuredAppWithTrustProxy(undefined);
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
    await app.close();
  });

  it('sets trust proxy to the configured hop count', async () => {
    const app = await configuredAppWithTrustProxy('1');
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);
    await app.close();
  });
});
