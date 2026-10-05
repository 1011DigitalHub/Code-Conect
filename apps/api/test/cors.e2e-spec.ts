import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';

const allowedOrigin = 'http://localhost:5173';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers the preflight for an allowed origin, with credentials allowed', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-headers']).toMatch(
      /x-csrf-token/i,
    );
  });

  it('does not allow an unknown origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://site-desconhecido.com')
      .set('Access-Control-Request-Method', 'POST');

    // This is the actual security boundary: without a matching
    // Access-Control-Allow-Origin, the browser discards the response and
    // never exposes it to script, regardless of Allow-Credentials (which the
    // `cors` package sets unconditionally whenever credentials: true is
    // configured — it isn't origin-gated, because it doesn't need to be).
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes Location to an allowed origin and echoes it with Vary: Origin', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);
    const res = await agent
      .post('/users')
      .set('Origin', allowedOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        password: 'senha-segura-123',
      })
      .expect(201);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers.vary).toMatch(/Origin/i);
    expect(res.headers['access-control-expose-headers']).toMatch(/Location/);
  });
});
