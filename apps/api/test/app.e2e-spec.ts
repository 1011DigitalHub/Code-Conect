import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { REQUEST_ID_HEADER } from './../src/common/interceptors/request-id.interceptor.js';
import { setupSwagger } from './../src/swagger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok' });
  });

  describe('GET /health/live', () => {
    it('returns 200 { status: ok } without checking any dependency', () => {
      return request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 with database up when the DB is reachable', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
    });
  });

  describe('RequestIdInterceptor', () => {
    it('adds an X-Request-ID header to every response', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
    });

    it('echoes a caller-supplied X-Request-ID back on the response', async () => {
      const id = 'my-trace-id-123';
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set(REQUEST_ID_HEADER, id)
        .expect(200);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(id);
    });
  });

  // Same assertion every other feature module's e2e makes about its own
  // paths (see auth.e2e-spec.ts, posts.e2e-spec.ts): the health routes are
  // meant to be consumed by infrastructure that may well read Swagger.
  it('documents all health routes in GET /api/docs-json', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const paths = Object.keys(res.body.paths);

    expect(paths).toContain('/');
    expect(paths).toContain('/health/live');
    expect(paths).toContain('/health/ready');
  });
});
