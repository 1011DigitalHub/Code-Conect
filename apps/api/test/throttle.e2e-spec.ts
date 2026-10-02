import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  LOGIN_THROTTLE,
  SIGN_UP_THROTTLE,
} from './../src/common/throttle.constants.js';
import { resetDatabase } from './db.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  // A fresh app per test, so the in-memory request counters start at zero.
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

  it('limits POST /auth/login: 401 until the limit, then 429 with Retry-After', async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: 'senha-errada-123' })
        .expect(401);
    }

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: newUser.email, password: 'senha-errada-123' })
      .expect(429);

    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits POST /users: 201 and 409 until the limit, then 429', async () => {
    await request(app.getHttpServer()).post('/users').send(newUser).expect(201);
    for (let i = 1; i < SIGN_UP_THROTTLE.limit; i++) {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(409);
    }

    const res = await request(app.getHttpServer())
      .post('/users')
      .send(newUser)
      .expect(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('does not limit GET /auth/me', async () => {
    for (let i = 0; i < LOGIN_THROTTLE.limit + 3; i++) {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    }
  });
});
