import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { isCookieSecure } from './../src/auth/cookie.constants.js';
import { cookieValue, fetchCsrfToken, setCookie } from './cookies.js';
import { resetDatabase } from './db.js';
import { createTestApp } from './helpers/app.js';

const newUser = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-segura-123',
};

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;

  // If COOKIE_SECURE ever leaks into the test env, every cookie test below
  // fails as an unexplained 401 (supertest's cookie jar silently refuses to
  // replay a Secure cookie over http) — assert the premise so that failure
  // is self-describing instead of a mystery.
  beforeAll(() => {
    expect(isCookieSecure()).toBe(false);
  });

  // A fresh app and an empty test database per test, so ids start at 1.
  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /users', () => {
    it('creates a user: 201, Location and body without password', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      const res = await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
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

    it('requires a csrf token (it is a @Public() route, but still an unsafe method)', () => {
      return request(app.getHttpServer()).post('/users').send(newUser).expect(403);
    });

    it('returns 409 for a duplicated email', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      const res = await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    });

    it('returns 400 for an invalid body or an extra field', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      const invalid = await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newUser, email: 'not-an-email', password: '123' })
        .expect(400);
      expect(invalid.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(Array.isArray(invalid.body.message)).toBe(true);

      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newUser, admin: true })
        .expect(400);
    });

    it('returns 400 for an email over 254 characters, instead of a 500 from the database', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      const overLongEmail = `${'a'.repeat(250)}@example.com`; // > 254 chars

      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newUser, email: overLongEmail })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    let agent: ReturnType<typeof request.agent>;
    let csrfToken: string;

    beforeEach(async () => {
      agent = request.agent(app.getHttpServer());
      csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
    });

    it('requires a csrf token (it is a @Public() route, but still an unsafe method)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(403);
    });

    it('returns 200 with the session metadata, and never the raw token', async () => {
      const res = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      expect(res.body).toStrictEqual({
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
      });
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('also sets the session as an httpOnly, SameSite=Strict cookie', async () => {
      const res = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
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
      const res = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password, remember: true })
        .expect(200);

      expect(res.body.expiresIn).toBe(7 * 24 * 3600);
      const access = setCookie(res, 'access_token');
      expect(access).toMatch(/Max-Age=604800/);
    });

    it('returns 401 for a wrong password', async () => {
      const res = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: 'errada-errada' })
        .expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('returns 400 for a malformed body', async () => {
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without a cookie, and an Authorization header is simply ignored', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      // The Bearer bridge was removed: AuthGuard no longer reads this
      // header at all, so a token here (even a valid one, see the e2e
      // below) does not authenticate the request.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });

    it('rejects a valid token sent only via Authorization, with no cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      const login = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      const capturedToken = cookieValue(setCookie(login, 'access_token'));

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${capturedToken}`)
        .expect(401);
    });

    it('returns the logged user with just the session cookie', async () => {
      // One cookie jar for the whole flow: supertest's agent captures
      // Set-Cookie from the login response and replays it automatically.
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const res = await agent.get('/auth/me').expect(200);
      expect(res.body).toMatchObject({ id: 1, email: newUser.email });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });
  });

  describe('GET /auth/session', () => {
    // The public counterpart of /auth/me: a 401 for an anonymous visitor
    // would be logged to the browser console on every public page load,
    // failing both the no-console-errors browser suite and Lighthouse's
    // scored best-practices audit.
    it('answers 200 with a null user for an anonymous visitor', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/session')
        .expect(200);
      expect(res.body).toEqual({ user: null });
    });

    it('reports the user once a session cookie is present', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const res = await agent.get('/auth/session').expect(200);
      expect(res.body.user).toMatchObject({ id: 1, email: newUser.email });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('ignores a malformed cookie instead of rejecting it', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Cookie', 'access_token=not-a-jwt')
        .expect(200);
      expect(res.body).toEqual({ user: null });
    });
  });

  describe('GET /auth/csrf', () => {
    it('sets a readable (non-HttpOnly) csrf_token cookie, even with no session', async () => {
      const res = await request(app.getHttpServer()).get('/auth/csrf').expect(204);
      const cookie = setCookie(res, 'csrf_token');
      expect(cookie).not.toMatch(/HttpOnly/i);
    });
  });

  describe('POST /auth/logout', () => {
    it('requires a session', () => {
      return request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('rejects a session request with no csrf token', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await agent.post('/auth/logout').expect(403);
    });

    it('rejects a csrf header that does not match the cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await agent
        .post('/auth/logout')
        .set('X-CSRF-Token', 'forged.token')
        .expect(403);
    });

    it('clears the session cookie and the next /auth/me is unauthorized', async () => {
      const agent = request.agent(app.getHttpServer());
      const signUpCsrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send(newUser)
        .expect(201);
      const login = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await agent.get('/auth/me').expect(200);

      // Logout is a protected, unsafe (POST) route, so it needs the matching
      // CSRF pair. Login already rotated one bound to this session.
      const csrfToken = cookieValue(setCookie(login, 'csrf_token'));
      const logout = await agent
        .post('/auth/logout')
        .set('X-CSRF-Token', csrfToken)
        .expect(204);
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
      const signUpCsrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send(newUser)
        .expect(201);
      const login = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      const capturedToken = cookieValue(setCookie(login, 'access_token'));
      const csrfToken = cookieValue(setCookie(login, 'csrf_token'));

      await agent.post('/auth/logout').set('X-CSRF-Token', csrfToken).expect(204);

      // Replayed by hand (not through the agent, whose jar already cleared
      // the cookie) to prove the point: the token itself, independent of
      // transport, is unaffected by logout.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${capturedToken}`)
        .expect(200);
    });
  });

  describe('persistence', () => {
    it('keeps users after the app restarts', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
      await app.close();

      // A new app instance, like restarting the API.
      app = await createTestApp();
      const newAgent = request.agent(app.getHttpServer());
      const loginCsrfToken = await fetchCsrfToken(newAgent);
      await newAgent
        .post('/auth/login')
        .set('X-CSRF-Token', loginCsrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      // Login rotates the csrf_token cookie to bind it to the new session,
      // so the pre-login token above no longer matches what's in the jar.
      const postLoginCsrfToken = await fetchCsrfToken(newAgent);
      await newAgent
        .post('/users')
        .set('X-CSRF-Token', postLoginCsrfToken)
        .send(newUser)
        .expect(409);
    });
  });

  describe('GET /api/docs-json', () => {
    it('documents every endpoint and the cookie/csrf schemes, with no bearer scheme left', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/users',
          '/auth/login',
          '/auth/logout',
          '/auth/me',
          '/auth/session',
          '/auth/csrf',
        ]),
      );
      expect(res.body.components.securitySchemes).toHaveProperty('cookie');
      expect(res.body.components.securitySchemes).toHaveProperty('csrf');
      expect(res.body.components.securitySchemes).not.toHaveProperty('bearer');
      expect(res.body.paths['/auth/login'].post.responses).toHaveProperty(
        '429',
      );
      expect(res.body.paths['/users'].post.responses).toHaveProperty('429');
    });
  });
});
