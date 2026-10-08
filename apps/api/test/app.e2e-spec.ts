import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupSwagger } from './../src/swagger.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok' });
  });

  // Same assertion every other feature module's e2e makes about its own
  // paths (see auth.e2e-spec.ts, posts.e2e-spec.ts): the health route is
  // meant to be consumed by infrastructure that may well read its Swagger
  // entry, not just curl the address.
  it('documents the health route in GET /api/docs-json', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(Object.keys(res.body.paths)).toContain('/');
  });

  afterEach(async () => {
    await app.close();
  });
});
