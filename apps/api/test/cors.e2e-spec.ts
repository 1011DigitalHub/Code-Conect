import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
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

  it('answers the preflight for an allowed origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-headers']).toMatch(
      /authorization/i,
    );
  });

  it('does not allow an unknown origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://site-desconhecido.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes Location to an allowed origin', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Origin', allowedOrigin)
      .send({
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        password: 'senha-segura-123',
      })
      .expect(201);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-expose-headers']).toMatch(/Location/);
  });
});
