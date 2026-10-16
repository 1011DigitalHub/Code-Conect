import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  DEFAULT_THROTTLE,
  LOGIN_THROTTLE,
  SIGN_UP_THROTTLE,
} from './../src/common/throttle.constants.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';
import { createTestApp } from './helpers/app.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  // A fresh app per test, so the in-memory request counters start at zero.
  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('limits POST /auth/login: 401 until the limit, then 429 with Retry-After', async () => {
    // Fetched once: the csrf_token cookie isn't rotated by a failed login,
    // so the same pair is valid for every attempt below the limit.
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);

    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: 'senha-errada-123' })
        .expect(401);
    }

    const res = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: newUser.email, password: 'senha-errada-123' })
      .expect(429);

    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  // Round 13 of plan/LoginSocial.md's review: POST /auth/login and
  // POST /auth/oidc/link both check a password against the same account, so
  // LoginThrottlerGuard (common/login-throttler.guard.ts) makes them share
  // one bucket — splitting the attempts across both routes below still
  // hits the limit at the same total count as hitting either route alone
  // would. Without the shared bucket, neither loop alone reaches
  // LOGIN_THROTTLE.limit and the last request wouldn't 429.
  it('shares one LOGIN_THROTTLE budget between POST /auth/login and POST /auth/oidc/link', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);
    const half = Math.floor(LOGIN_THROTTLE.limit / 2);

    for (let i = 0; i < half; i++) {
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: 'senha-errada-123' })
        .expect(401);
    }
    for (let i = half; i < LOGIN_THROTTLE.limit; i++) {
      await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', csrfToken)
        .send({ password: 'senha-errada-123' })
        .expect(401);
    }

    const res = await agent
      .post('/auth/oidc/link')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'senha-errada-123' })
      .expect(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits POST /users: 201 and 409 until the limit, then 429', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);

    await agent
      .post('/users')
      .set('X-CSRF-Token', csrfToken)
      .send(newUser)
      .expect(201);
    for (let i = 1; i < SIGN_UP_THROTTLE.limit; i++) {
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(409);
    }

    const res = await agent
      .post('/users')
      .set('X-CSRF-Token', csrfToken)
      .send(newUser)
      .expect(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('does not limit GET /auth/me below the default global limit', async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit + 3; i++) {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    }
  });

  it('limits GET /auth/me too, past the default global limit: ThrottlerGuard runs before AuthGuard', async () => {
    // Proves the guard order declared in AppModule actually holds: if
    // AuthGuard ran first, it would reject every one of these with 401 and
    // short-circuit the chain, so ThrottlerGuard would never even see them
    // (a guard that throws stops the rest from running) — the count would
    // never advance and this would never 429.
    for (let i = 0; i < DEFAULT_THROTTLE.limit; i++) {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    }

    const res = await request(app.getHttpServer()).get('/auth/me').expect(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  // GET / is deliberately @SkipThrottle()'d (see app.controller.ts): it
  // reads nothing sensitive and changes no state, so a probe polling past
  // the default limit must never 429 — the health check becoming the
  // reason infrastructure reads the service as unhealthy would defeat its
  // own purpose.
  it('never limits GET /, past the default global limit', async () => {
    for (let i = 0; i < DEFAULT_THROTTLE.limit + 5; i++) {
      await request(app.getHttpServer()).get('/').expect(200);
    }
  });
});
