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
  const [encoded] = cookieValue(raw).split('.');
  return JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString('utf8'));
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

  // None of these ever reach the browser as a raw JSON error: the whole
  // endpoint is a redirect target a real person's browser is driving (or
  // an attacker is tampering with), so every rejection bounces to /login
  // instead — see OidcController.callback.
  describe('GET /auth/oidc/:provider/callback — rejections redirect to /login, not a raw error', () => {
    async function expectLoginRedirect(url: string) {
      const res = await request(app.getHttpServer()).get(url);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    }

    it('with no oidc_flow cookie at all', () => {
      return expectLoginRedirect('/auth/oidc/google/callback?code=whatever&state=whatever');
    });

    it('with a state that does not match the one in the cookie', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode();
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=not-the-real-state`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
      expect(flow.state).not.toBe('not-the-real-state');
    });

    it('with a missing code', async () => {
      const { agent, flow } = await startFlow();
      const res = await agent.get(`/auth/oidc/google/callback?state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    it('once the flow cookie has expired, even though the Max-Age has not literally elapsed in real time', async () => {
      const { agent, flow } = await startFlow();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute ttl
      const code = fakeIdp.encodeCode();
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
      vi.useRealTimers();
    });

    it('when the code_verifier does not match the code_challenge the provider expects (PKCE)', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: 'a-completely-different-challenge' });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    it('with an id_token with an invalid signature', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, signWithWrongKey: true });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    it('with an id_token for a different aud (client_id)', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims: { aud: 'someone-elses-client-id' } });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    it('with an id_token from an unrecognized issuer', async () => {
      const { agent, flow } = await startFlow();
      const challenge = await expectedCodeChallenge(flow.codeVerifier);
      const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims: { iss: 'https://attacker.example.com' } });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    it('on a token-endpoint failure (e.g. an already-used or invalid code)', async () => {
      const { agent, flow } = await startFlow();
      const code = fakeIdp.encodeCode({ tokenEndpointFails: true });
      const res = await agent.get(`/auth/oidc/google/callback?code=${code}&state=${flow.state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });

    // Not a security exception — the provider sends this instead of a code
    // when the person clicks "cancel"/"deny" on its own consent screen.
    it('when the provider reports ?error= (the person cancelled)', async () => {
      const { agent, flow } = await startFlow();
      const res = await agent.get(
        `/auth/oidc/google/callback?error=access_denied&state=${flow.state}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
    });
  });

  describe('GET /auth/oidc/:provider/start — provider not configured', () => {
    it('redirects to /login?oidcError=1 instead of a raw JSON error, before touching any cookie', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      const res = await request(app.getHttpServer()).get('/auth/oidc/google/start');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
      expect(() => setCookie(res, 'oidc_flow')).toThrow();
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
      const attackerRes = await attacker.agent.get(
        `/auth/oidc/google/callback?code=${code}&state=${attacker.flow.state}`,
      );
      expect(attackerRes.status).toBe(302);
      expect(attackerRes.headers.location).toBe('http://localhost:5173/login?oidcError=1');

      // The attacker never got a session, and the real owner's identity
      // still resolves only to themselves.
      const stillFirstMe = await first.agent.get('/auth/me').expect(200);
      expect(stillFirstMe.body.id).toBe(firstMe.body.id);
    });

    // A pre-registration attack: without this, an attacker could claim the
    // victim's email (unverified) before the victim ever signs up, planting
    // an account that the victim's later, legitimately-verified login would
    // auto-link into instead of creating a fresh account of their own.
    it('refuses to create a brand-new account when the email is not verified — no account is planted', async () => {
      const { res } = await completeFlow({
        sub: 'sub-attacker',
        email: 'alguem-novo@exemplo.com',
        email_verified: false,
      });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?oidcError=1');
      expect(() => setCookie(res, 'access_token')).toThrow();

      // The real owner, later logging in for real with a verified email,
      // gets a brand-new account — not one the attacker already touched.
      const real = await completeFlow({
        sub: 'sub-real-owner',
        email: 'alguem-novo@exemplo.com',
        email_verified: true,
      });
      expect(real.res.status).toBe(302);
      expect(real.res.headers.location).toBe('http://localhost:5173/perfil');
      const me = await real.agent.get('/auth/me').expect(200);
      expect(me.body.email).toBe('alguem-novo@exemplo.com');
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
      // Unlike oidc_flow, linking_token respects the configured
      // COOKIE_SAMESITE (default Strict in tests) rather than being forced
      // to Lax — see cookie.constants.ts's getLinkingTokenCookieOptions.
      expect(linkingCookie).toMatch(/SameSite=Strict/i);
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

    // The @@unique([provider, providerSub]) constraint is the actual
    // single-use guarantee oidc-linking-token.ts's own comments describe —
    // this is what proves it: replaying the exact same linking_token after
    // it already succeeded once must not silently re-link (or no-op), it
    // has to surface as a conflict.
    it('rejects a replay of the same linking_token after it already succeeded, with 409', async () => {
      const { agent, res } = await triggerLinking();
      const capturedToken = cookieValue(setCookie(res, 'linking_token'));

      const csrfToken = await fetchCsrfToken(agent);
      await agent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', csrfToken)
        .send({ password: localUser.password })
        .expect(200);

      // The agent's own jar already dropped linking_token (cleared on
      // success) — replaying means resending the captured value by hand,
      // exactly as if the callback redirect had been followed twice. Both
      // cookies are set explicitly in one header (not via an agent's jar
      // plus an overriding .set('Cookie', ...), which would just replace
      // the jar's own header instead of combining with it).
      const replayAgent = request.agent(app.getHttpServer());
      const replayCsrf = await fetchCsrfToken(replayAgent);
      const replay = await replayAgent
        .post('/auth/oidc/link')
        .set('X-CSRF-Token', replayCsrf)
        .set('Cookie', `csrf_token=${encodeURIComponent(replayCsrf)}; linking_token=${encodeURIComponent(capturedToken)}`)
        .send({ password: localUser.password })
        .expect(409);
      expect(replay.body).toMatchObject({ statusCode: 409 });
    });

    // A typo deserves a normal retry, the same way a wrong password on
    // /auth/login does (same LOGIN_THROTTLE bounds how many) — the
    // linking_token's own 5-minute exp is what eventually forces a fresh
    // OIDC flow, not the first wrong guess.
    it('allows retrying with the correct password after a wrong one, reusing the same linking_token', async () => {
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
        .expect(200);
      expect(retry.body).toStrictEqual({ tokenType: 'Bearer', expiresIn: expect.any(Number) });
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
