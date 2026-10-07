import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  DEFAULT_THROTTLE,
  LOGIN_THROTTLE,
  SIGN_UP_THROTTLE,
} from './../src/common/throttle.constants.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  // A fresh app per test, so the in-memory request counters start at zero.
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
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
});
