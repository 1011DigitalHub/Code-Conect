import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';

// The global AuthGuard (APP_GUARD, registered in AuthModule) must protect
// every route by default and only let through what carries @Public(). This
// suite builds a bare app from AppModule, deliberately skipping
// configureApp(), because the guard is global-provider-based and must not
// depend on any middleware main.ts/configureApp sets up.
describe('Global AuthGuard (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps the health route public without configureApp', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('keeps sign-up public (no auth needed, just the csrf pair every unsafe method needs)', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);
    return agent
      .post('/users')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        password: 'senha-segura-123',
      })
      .expect(201);
  });

  it('keeps login public (no auth needed, just the csrf pair every unsafe method needs)', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await fetchCsrfToken(agent);
    await agent.post('/users').set('X-CSRF-Token', csrfToken).send({
      name: 'Maria Silva',
      email: 'maria@exemplo.com',
      password: 'senha-segura-123',
    });
    return agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'maria@exemplo.com', password: 'senha-segura-123' })
      .expect(200);
  });

  it('protects every other route by default', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
