import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';
import { getJwtSecret, JWT_ALGORITHM } from './../src/auth/auth.constants.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';

// Regressions and attack-shaped inputs that don't belong in auth.e2e-spec.ts
// (which is about the happy paths). Each case here documents a security
// property the implementation must keep holding, not just a status code.
describe('Security regressions (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const newUser = {
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    password: 'senha-segura-123',
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    await resetDatabase(app);
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /auth/me: every way an invalid session can be presented', () => {
    it('401s with no cookie at all', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('401s with a garbage cookie value', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', 'access_token=not-a-jwt-at-all')
        .expect(401);
    });

    it('401s with a token signed by a different secret', async () => {
      const forged = new JwtService({ secret: 'not-the-real-secret' });
      const token = await forged.signAsync(
        { sub: 1, email: newUser.email },
        { algorithm: JWT_ALGORITHM },
      );
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${token}`)
        .expect(401);
    });

    it('401s with an expired token', async () => {
      const token = await jwtService.signAsync(
        { sub: 1, email: newUser.email },
        { secret: getJwtSecret(), algorithm: JWT_ALGORITHM, expiresIn: '-1s' },
      );
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${token}`)
        .expect(401);
    });

    it('401s for a valid token belonging to a since-deleted user', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent.post('/users').set('X-CSRF-Token', csrfToken).send(newUser).expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      await agent.get('/auth/me').expect(200);

      await app.get(PrismaService).user.delete({ where: { id: 1 } });

      await agent.get('/auth/me').expect(401);
    });
  });

  describe('CSRF: every way the double-submit pair can fail to match', () => {
    it('403s a protected mutation with the cookie in the jar but no header sent', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent.post('/users').set('X-CSRF-Token', csrfToken).send(newUser).expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      // The agent's jar still carries a valid csrf_token cookie; this call
      // just doesn't echo it back in the header, which is exactly what the
      // double-submit check exists to catch.
      await agent.post('/auth/logout').expect(403);
    });

    it('403s when the header does not match the cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent.post('/users').set('X-CSRF-Token', csrfToken).send(newUser).expect(201);
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      await agent.post('/auth/logout').set('X-CSRF-Token', 'a-different-token').expect(403);
    });

    it('403s a token minted for a different (or no) session', async () => {
      // Anonymous bootstrap, never logs in: this token's session key is
      // "anon", not this user's.
      const anonAgent = request.agent(app.getHttpServer());
      const anonCsrfToken = await fetchCsrfToken(anonAgent);

      const loggedInAgent = request.agent(app.getHttpServer());
      const signUpCsrfToken = await fetchCsrfToken(loggedInAgent);
      await loggedInAgent
        .post('/users')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send(newUser)
        .expect(201);
      await loggedInAgent
        .post('/auth/login')
        .set('X-CSRF-Token', signUpCsrfToken)
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      // Smuggle the anonymous token in as both cookie and header on the
      // authenticated agent: they match each other, but not the session.
      await loggedInAgent
        .post('/auth/logout')
        .set('Cookie', `csrf_token=${anonCsrfToken}`)
        .set('X-CSRF-Token', anonCsrfToken)
        .expect(403);
    });
  });

  describe('Mass assignment', () => {
    it('rejects extra fields with 400, naming them but never echoing their values', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      const res = await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newUser, id: 99, role: 'admin', passwordHash: 'hacked-hash' })
        .expect(400);

      // The error legitimately names the rejected fields ("property role
      // should not exist") — that's required for a usable 400. What must
      // never happen is the attacker-supplied *value* coming back.
      expect(JSON.stringify(res.body)).not.toMatch(/admin|hacked-hash/i);
    });
  });

  describe('Routes that must stay reachable without a session', () => {
    it('GET / (health)', () => {
      return request(app.getHttpServer()).get('/').expect(200);
    });

    it('GET /api/docs-json', () => {
      return request(app.getHttpServer()).get('/api/docs-json').expect(200);
    });

    it('GET /api/docs (the Swagger UI page itself)', () => {
      return request(app.getHttpServer())
        .get('/api/docs')
        .expect(200)
        .expect('Content-Type', /text\/html/);
    });
  });

  describe('Helmet security headers', () => {
    it('sets the standard protective headers and removes X-Powered-By', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it("keeps the Swagger UI's inline init script allowed, even with a CSP in place", async () => {
      const res = await request(app.getHttpServer()).get('/api/docs').expect(200);

      expect(res.headers['content-security-policy']).toMatch(
        /script-src[^;]*'unsafe-inline'/,
      );
    });
  });
});
