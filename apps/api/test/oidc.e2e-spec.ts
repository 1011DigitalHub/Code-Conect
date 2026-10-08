import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';
import { cookieValue, fetchCsrfToken, setCookie } from './cookies.js';
import { resetDatabase } from './db.js';
import { startFakeIdp, FAKE_IDP_ISSUER, type FakeIdp, type FakeIdTokenOptions } from './oidc-fake-idp.js';

async function createApp(): Promise<NestExpressApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app;
}

function decodeFlowCookie(raw: string): { provider: string; state: string; codeVerifier: string; exp: number } {
  return JSON.parse(Buffer.from(cookieValue(raw), 'base64url').toString('utf8'));
}

describe('OIDC login (e2e)', () => {
  let app: NestExpressApplication;
  let fakeIdp: FakeIdp;

  beforeAll(async () => {
    fakeIdp = await startFakeIdp();
  });

  afterAll(async () => {
    await fakeIdp.close();
  });

  beforeEach(async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('GOOGLE_AUTHORIZATION_ENDPOINT', `${fakeIdp.url}/authorize`);
    vi.stubEnv('GOOGLE_TOKEN_ENDPOINT', `${fakeIdp.url}/token`);
    vi.stubEnv('GOOGLE_JWKS_URI', `${fakeIdp.url}/jwks`);
    vi.stubEnv('GOOGLE_ISSUER', FAKE_IDP_ISSUER);

    app = await createApp();
    await resetDatabase(app);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  // Starts the flow and hands back the agent (with the oidc_flow cookie
  // already in its jar) plus the decoded state/codeVerifier the test needs
  // to build a matching (or deliberately mismatched) callback request —
  // there is no real browser here to drive the redirect through the
  // provider's own /authorize page.
  async function startFlow() {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.get('/auth/oidc/google/start').expect(302);
    expect(res.headers.location).toContain(`${fakeIdp.url}/authorize`);
    const flow = decodeFlowCookie(setCookie(res, 'oidc_flow'));
    return { agent, flow };
  }

  async function expectedCodeChallenge(codeVerifier: string): Promise<string> {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  // Drives a full round trip against the google provider with the given
  // id_token claim overrides. Shared by the success and auto-link describe
  // blocks below.
  async function completeFlow(claims?: FakeIdTokenOptions['claims']) {
    const { agent, flow } = await startFlow();
    const challenge = await expectedCodeChallenge(flow.codeVerifier);
    const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims });
    const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
    return { agent, res };
  }

  describe('GET /auth/oidc/:provider/start', () => {
    it('rejects an unknown provider with 400', () => {
      return request(app.getHttpServer()).get('/auth/oidc/github/start').expect(400);
    });

    it('redirects to the authorization endpoint with PKCE S256 and sets a short-lived httpOnly cookie', async () => {
      const { flow } = await startFlow();
      expect(flow.provider).toBe('google');
      expect(flow.state).toBeTruthy();
      expect(flow.codeVerifier).toBeTruthy();
    });
  });

  describe('GET /auth/oidc/:provider/callback — rejections', () => {
    it('rejects with no oidc_flow cookie at all', () => {
      return request(app.getHttpServer())
        .get('/auth/oidc/google/callback?code=whatever&state=whatever')
        .expect(400);
    });

    it('rejects a state that does not match the one in the cookie', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode();
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=not-the-real-state`).expect(400);
      expect(flow.state).not.toBe('not-the-real-state');
    });

    it('rejects a missing code', async () => {
      const { agent, flow } = await startFlow();
      await agent.get(`/auth/oidc/google/callback?state=${flow.state}`).expect(400);
    });

    it('rejects once the flow cookie has expired, even though the Max-Age has not literally elapsed in real time', async () => {
      const { agent, flow } = await startFlow();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute ttl
      const code = fakeIdp.encodeCode();
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(400);
      vi.useRealTimers();
    });

    it('rejects when the code_verifier does not match the code_challenge the provider expects (PKCE)', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: 'a-completely-different-challenge' });
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(400);
    });

    it('rejects an id_token with an invalid signature', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, signWithWrongKey: true });
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(401);
    });

    it('rejects an id_token for a different aud (client_id)', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims: { aud: 'someone-elses-client-id' } });
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(401);
    });

    it('rejects an id_token from an unrecognized issuer', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims: { iss: 'https://attacker.example.com' } });
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(401);
    });

    it('maps a token-endpoint failure (e.g. an already-used or invalid code) to 400', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode({ tokenEndpointFails: true });
      await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`).expect(400);
    });

    // Not a security exception — the provider sends this instead of a code
    // when the person clicks "cancel"/"deny" on its own consent screen, a
    // normal outcome that deserves a friendly bounce, not a raw JSON 400 on
    // the API's own origin.
    it('redirects to the web app /login (not a raw error) when the provider reports ?error=', async () => {
      const { agent, flow } = await startFlow();
      const res = await agent.get(
        `/auth/oidc/google/callback?error=access_denied&state=${flow.state}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login');
    });

    it('answers 404 for a provider with no client_id configured, before touching any cookie', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      await request(app.getHttpServer()).get('/auth/oidc/google/start').expect(404);
    });
  });

  describe('GET /auth/oidc/:provider/callback — success', () => {
    it('creates a new user, signs them in, and redirects to the web app /perfil', async () => {
      const { agent, res } = await completeFlow({ sub: 'sub-new-1', email: 'nova@exemplo.com', name: 'Nova Pessoa' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/perfil');
      const access = setCookie(res, 'access_token');
      expect(access).toMatch(/HttpOnly/i);

      const me = await agent.get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ name: 'Nova Pessoa', email: 'nova@exemplo.com' });
    });

    it('clears the oidc_flow cookie exactly once the callback has been used', async () => {
      const { res } = await completeFlow({ sub: 'sub-new-2', email: 'outra@exemplo.com' });
      const cleared = setCookie(res, 'oidc_flow');
      expect(cookieValue(cleared) === '' || /Expires=.*1970/.test(cleared)).toBe(true);
    });

    it('signs in as the same user on a second login with the same (provider, sub), without creating a duplicate', async () => {
      const first = await completeFlow({ sub: 'sub-repeat', email: 'repete@exemplo.com' });
      const firstMe = await first.agent.get('/auth/me').expect(200);

      const second = await completeFlow({ sub: 'sub-repeat', email: 'repete@exemplo.com' });
      const secondMe = await second.agent.get('/auth/me').expect(200);

      expect(secondMe.body.id).toBe(firstMe.body.id);
    });

    it('never logs into an OIDC-only account via POST /auth/login — same generic 401 as a wrong password', async () => {
      await completeFlow({ sub: 'sub-oidc-only', email: 'so-oidc@exemplo.com' });

      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      const res = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'so-oidc@exemplo.com', password: 'qualquer-coisa' })
        .expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });
  });

  describe('auto-link to an OIDC-only account (no local password to protect)', () => {
    it('links a second provider identity automatically when the new email is verified', async () => {
      const first = await completeFlow({ sub: 'sub-google-1', email: 'duas-contas@exemplo.com', email_verified: true });
      const firstMe = await first.agent.get('/auth/me').expect(200);

      vi.stubEnv('MICROSOFT_CLIENT_ID', 'test-client-id');
      vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('MICROSOFT_AUTHORIZATION_ENDPOINT', `${fakeIdp.url}/authorize`);
      vi.stubEnv('MICROSOFT_TOKEN_ENDPOINT', `${fakeIdp.url}/token`);
      vi.stubEnv('MICROSOFT_JWKS_URI', `${fakeIdp.url}/jwks`);
      vi.stubEnv('MICROSOFT_ISSUER', FAKE_IDP_ISSUER);

      const agent = request.agent(app.getHttpServer());
      const startRes = await agent.get('/auth/oidc/microsoft/start').expect(302);
      const flow = decodeFlowCookie(setCookie(startRes, 'oidc_flow'));
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({
        expectedCodeChallenge: challenge,
        claims: { sub: 'sub-microsoft-1', email: 'duas-contas@exemplo.com', email_verified: true },
      });
      const res = await agent.get(`/auth/oidc/microsoft/callback?code=${code}&state=${flow.state}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/perfil');
      const secondMe = await agent.get('/auth/me').expect(200);
      expect(secondMe.body.id).toBe(firstMe.body.id);
    });

    // The nOAuth account-takeover shape: without this, a provider that lets
    // an attacker set an arbitrary, unverified email on their own account
    // would be enough to link their identity to any OIDC-only account that
    // happens to share it — see OidcService.resolveIdentity.
    it('refuses to auto-link when the new identity email is not verified — the existing account is untouched', async () => {
      const first = await completeFlow({ sub: 'sub-victim', email: 'vitima@exemplo.com', email_verified: true });
      const firstMe = await first.agent.get('/auth/me').expect(200);

      const attacker = await startFlow();
      const challenge = await expectedCodeChallenge(attacker.flow.codeVerifier);
      const code = fakeIdp.encodeCode({
        expectedCodeChallenge: challenge,
        claims: { sub: 'sub-attacker', email: 'vitima@exemplo.com', email_verified: false },
      });
      await attacker.agent
        .get(`/auth/oidc/google/callback?code=${code}&state=${attacker.flow.state}`)
        .expect(401);

      // The attacker never got a session, and the real owner's identity
      // still resolves only to themselves.
      const stillFirstMe = await first.agent.get('/auth/me').expect(200);
      expect(stillFirstMe.body.id).toBe(firstMe.body.id);
    });
  });

  describe('account linking (email collision with an existing local account)', () => {
    const localUser = { name: 'Maria Silva', email: 'maria@exemplo.com', password: 'senha-segura-123' };

    async function createLocalAccount() {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);
      await agent.post('/users').set('X-CSRF-Token', csrfToken).send(localUser).expect(201);
    }

    async function triggerLinking() {
      await createLocalAccount();
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({
        expectedCodeChallenge: challenge,
        claims: { sub: 'sub-collision', email: localUser.email },
      });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      return { agent, res };
    }

    it('never auto-merges: redirects to /vincular-conta with a linking_token cookie instead of signing in', async () => {
      const { res } = await triggerLinking();

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/vincular-conta?provider=google');
      expect(() => setCookie(res, 'access_token')).toThrow();
      const linkingCookie = setCookie(res, 'linking_token');
      expect(linkingCookie).toMatch(/HttpOnly/i);
      expect(linkingCookie).toMatch(/SameSite=Lax/i);
    });

    it('rejects POST /auth/oidc/link with the wrong password — generic 401, no identity created', async () => {
      const { agent } = await triggerLinking();
      const csrfToken = await fetchCsrfToken(agent);

      const res = await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', csrfToken)
        .send({ password: 'senha-errada' })
        .expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('links on the correct password: signs in as the existing local user and the identity now also logs them in directly', async () => {
      const { agent } = await triggerLinking();
      const csrfToken = await fetchCsrfToken(agent);

      const linkRes = await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', csrfToken)
        .send({ password: localUser.password })
        .expect(200);
      expect(linkRes.body).toStrictEqual({ tokenType: 'Bearer', expiresIn: expect.any(Number) });

      const me = await agent.get('/auth/me').expect(200);
      expect(me.body.email).toBe(localUser.email);

      // The same (provider, sub) now resolves straight to the linked user,
      // no second collision.
      const second = await startFlow();
      const challenge = await expectedCodeChallenge(second.flow.codeVerifier);
      const code = fakeIdp.encodeCode({
        expectedCodeChallenge: challenge,
        claims: { sub: 'sub-collision', email: localUser.email },
      });
      const secondRes = await second.agent.get(
        `/auth/oidc/google/callback?code=${code}&state=${second.flow.state}`,
      );
      expect(secondRes.status).toBe(302);
      expect(secondRes.headers.location).toBe('http://localhost:5173/perfil');
    });

    it('clears the linking_token cookie after a failed attempt — a retry needs the whole OIDC flow again', async () => {
      const { agent } = await triggerLinking();
      const csrfToken = await fetchCsrfToken(agent);

      await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', csrfToken)
        .send({ password: 'senha-errada' })
        .expect(401);

      const retryCsrf = await fetchCsrfToken(agent);
      const retry = await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', retryCsrf)
        .send({ password: localUser.password })
        .expect(401);
      expect(retry.body).toMatchObject({ statusCode: 401 });
    });
  });

  describe('GET /api/docs-json', () => {
    it('documents the three OIDC endpoints', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/auth/oidc/{provider}/start',
          '/auth/oidc/{provider}/callback',
          '/auth/oidc/link',
        ]),
      );
    });
  });
});
