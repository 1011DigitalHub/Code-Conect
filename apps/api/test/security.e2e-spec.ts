import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';
import { getJwtSecret, JWT_ALGORITHM } from './../src/auth/auth.constants.js';
import { HealthService } from './../src/health/health.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { fetchCsrfToken } from './cookies.js';
import { resetDatabase } from './db.js';

// Regressions and attack-shaped inputs that don't belong in auth.e2e-spec.ts
// (which is about the happy paths). Each case here documents a security
// property the implementation must keep holding, not just a status code.
describe('Security regressions (e2e)', () => {
  let app: NestExpressApplication;
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
    app = moduleFixture.createNestApplication<NestExpressApplication>();
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

    it('also applies to an OPTIONS preflight, not just real requests', async () => {
      // Caught live against the built Docker image, not by a test: the
      // `cors` package ends an OPTIONS preflight itself without calling
      // next(), so when helmet was registered after enableCors() in
      // configureApp, it never ran for that request at all and
      // X-Powered-By leaked through on every preflight.
      const res = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('JSON body size limit', () => {
    it('413s a payload over the 10kb limit', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);

      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newUser, name: 'a'.repeat(20_000) })
        .expect(413);
    });

    it('accepts a normal-sized payload', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);

      await agent
        .post('/users')
        .set('X-CSRF-Token', csrfToken)
        .send(newUser)
        .expect(201);
    });
  });
});

// Separate app instance: overrides HealthService to throw a raw Error
// (rather than returning false), which is the one way to make a route throw
// something that isn't already an HttpException without faking a whole
// database outage. GET / is the trigger because it needs no cookie, no CSRF
// pair and no body — the failure mode under test is the filter, not auth.
describe('Global exception filter: an unexpected failure (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HealthService)
      .useValue({
        isDatabaseReachable: () => {
          throw new Error('relation "users" does not exist at line 42');
        },
      })
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('masks the failure as a generic 500 instead of leaking the real error', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(500);

    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist|line 42/i);
  });
});
