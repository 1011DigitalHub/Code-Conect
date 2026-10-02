import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  // A fresh app per test, so the in-memory users array starts empty.
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /users', () => {
    it('creates a user: 201, Location and body without password', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(201);

      expect(res.headers.location).toBe('/users/1');
      expect(res.body).toMatchObject({
        id: 1,
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        links: { self: '/users/1' },
      });
      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('returns 409 for a duplicated email', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(201);
      const res = await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    });

    it('returns 400 for an invalid body or an extra field', async () => {
      const invalid = await request(app.getHttpServer())
        .post('/users')
        .send({ ...newUser, email: 'not-an-email', password: '123' })
        .expect(400);
      expect(invalid.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(Array.isArray(invalid.body.message)).toBe(true);

      await request(app.getHttpServer())
        .post('/users')
        .send({ ...newUser, admin: true })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(201);
    });

    it('returns 200 with a bearer token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('returns 401 for a wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: 'errada-errada' })
        .expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('returns 400 for a malformed body', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without a token and with an invalid one', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });

    it('returns the logged user with the login token', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        id: 1,
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });
  });

  describe('GET /api/docs-json', () => {
    it('documents the three endpoints and the bearer scheme', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/users', '/auth/login', '/auth/me']),
      );
      expect(res.body.components.securitySchemes).toHaveProperty('bearer');
    });
  });
});
