import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';
import { isCookieSecure } from './../src/auth/cookie.constants.js';
import { cookieValue, setCookie } from './cookies.js';
import { resetDatabase } from './db.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  // If COOKIE_SECURE ever leaks into the test env, every cookie test below
  // fails as an unexplained 401 (supertest's cookie jar silently refuses to
  // replay a Secure cookie over http) — assert the premise so that failure
  // is self-describing instead of a mystery.
  beforeAll(() => {
    expect(isCookieSecure()).toBe(false);
  });

  // A fresh app and an empty test database per test, so ids start at 1.
  beforeEach(async () => {
    app = await createApp();
    await resetDatabase(app);
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

    it('also sets the session as an httpOnly, SameSite=Strict cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const access = setCookie(res, 'access_token');
      expect(access).toMatch(/HttpOnly/i);
      expect(access).toMatch(/SameSite=Strict/i);
      expect(access).toMatch(/Path=\//);
      // COOKIE_SECURE is off in tests on purpose (see the beforeAll above).
      expect(access).not.toMatch(/Secure/i);
      // Not "remember me": a session cookie, with no Max-Age/Expires.
      expect(access).not.toMatch(/Max-Age/i);
    });

    it('sets a persistent cookie, matching the longer ttl, when remember is true', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password, remember: true })
        .expect(200);

      expect(res.body.expiresIn).toBe(7 * 24 * 3600);
      const access = setCookie(res, 'access_token');
      expect(access).toMatch(/Max-Age=604800/);
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

    it('returns the logged user with just the session cookie, no Authorization header', async () => {
      // One cookie jar for the whole flow: supertest's agent captures
      // Set-Cookie from the login response and replays it automatically.
      const agent = request.agent(app.getHttpServer());
      await agent.post('/users').send(newUser).expect(201);
      await agent
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const res = await agent.get('/auth/me').expect(200);
      expect(res.body).toMatchObject({ id: 1, email: newUser.email });
    });
  });

  describe('POST /auth/logout', () => {
    it('requires a session', () => {
      return request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('clears the session cookie and the next /auth/me is unauthorized', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/users').send(newUser).expect(201);
      await agent
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await agent.get('/auth/me').expect(200);

      const logout = await agent.post('/auth/logout').expect(204);
      const cleared = setCookie(logout, 'access_token');
      expect(cleared).toMatch(/Path=\//);
      expect(cookieValue(cleared) === '' || /Expires=.*1970/.test(cleared)).toBe(
        true,
      );

      await agent.get('/auth/me').expect(401);
    });

    it('a token captured before logout still works until it expires (documented, not fixed)', async () => {
      // With a stateless JWT, clearing the cookie does not revoke the
      // token itself — a copy made before logout stays valid until its own
      // expiry. This is a deliberately accepted trade-off (see
      // SECURITY.md): revoking it server-side would need a tokenVersion
      // column or a denylist, which costs a database round trip on every
      // authenticated request.
      const agent = request.agent(app.getHttpServer());
      await agent.post('/users').send(newUser).expect(201);
      const login = await agent
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      const capturedToken = login.body.accessToken as string;

      await agent.post('/auth/logout').expect(204);

      // Replayed by hand (not through the agent, whose jar already cleared
      // the cookie) so this keeps proving the point once the Bearer bridge
      // is removed later.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${capturedToken}`)
        .expect(200);
    });
  });

  describe('persistence', () => {
    it('keeps users after the app restarts', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(201);
      await app.close();

      // A new app instance, like restarting the API.
      app = await createApp();
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await request(app.getHttpServer())
        .post('/users')
        .send(newUser)
        .expect(409);
    });
  });

  describe('GET /api/docs-json', () => {
    it('documents the three endpoints and the bearer scheme', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/users',
          '/auth/login',
          '/auth/logout',
          '/auth/me',
        ]),
      );
      expect(res.body.components.securitySchemes).toHaveProperty('bearer');
      expect(res.body.paths['/auth/login'].post.responses).toHaveProperty(
        '429',
      );
      expect(res.body.paths['/users'].post.responses).toHaveProperty('429');
    });
  });
});
