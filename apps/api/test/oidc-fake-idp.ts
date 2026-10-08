import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// A fixed string, deliberately unrelated to the fake server's own address:
// it only needs to be a value the tests can point GOOGLE_ISSUER/
// MICROSOFT_ISSUER at, standing in for a real provider's issuer.
export const FAKE_IDP_ISSUER = 'https://fake-idp.test/issuer';
export const FAKE_IDP_KID = 'fake-idp-key-1';

export interface FakeIdTokenOptions {
  // Overrides merged onto a valid-by-default claim set (iss, aud, sub,
  // email, name, iat, exp) — set a field to deliberately break one check.
  claims?: Record<string, unknown>;
  // Signs with a second, never-published keypair instead of the one whose
  // public half is served from /jwks — simulates a forged id_token.
  signWithWrongKey?: boolean;
  // The /token response carries no id_token at all.
  omitIdToken?: boolean;
  // The token endpoint answers like a provider rejecting the exchange
  // outright (a real provider does this for a bad code or a PKCE mismatch
  // it has already checked itself — see expectedCodeChallenge below).
  tokenEndpointFails?: boolean;
  // The provider's own PKCE check: if set, the /token handler recomputes
  // base64url(sha256(code_verifier)) from what the API actually sent and
  // rejects the exchange unless it equals this value — mirroring a real
  // provider refusing a code whose verifier doesn't match the challenge
  // that it received back in /start's (never-visited, in this test) hit of
  // /authorize.
  expectedCodeChallenge?: string;
}

export interface FakeIdp {
  url: string;
  // Encodes the intent for the /token handler straight into the
  // authorization `code` our e2e test hands the callback — there is no real
  // browser running the /authorize step in these tests, so this is the only
  // channel to tell the fake provider what to do with this one exchange.
  encodeCode(options?: FakeIdTokenOptions): string;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startFakeIdp(): Promise<FakeIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const { privateKey: wrongPrivateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res).catch((error: unknown) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://fake-idp.local');

    if (url.pathname === '/jwks' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: FAKE_IDP_KID, alg: 'RS256', use: 'sig' }] }));
      return;
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req));
      const code = body.get('code') ?? '';
      const codeVerifier = body.get('code_verifier') ?? '';

      let options: FakeIdTokenOptions = {};
      try {
        options = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
      } catch {
        // An empty/malformed code just means "no special instructions" — a
        // valid token with the default claims below.
      }

      if (options.expectedCodeChallenge) {
        const { createHash } = await import('node:crypto');
        const actual = createHash('sha256').update(codeVerifier).digest('base64url');
        if (actual !== options.expectedCodeChallenge) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed' }));
          return;
        }
      }

      if (options.tokenEndpointFails) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }

      if (options.omitIdToken) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'irrelevant', token_type: 'Bearer' }));
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> & { iat?: number; exp?: number } = {
        iss: FAKE_IDP_ISSUER,
        aud: 'test-client-id',
        sub: 'sub-123',
        email: 'maria@exemplo.com',
        // A trustworthy provider by default; tests exercising the
        // email_verified gate (see OidcService.resolveIdentity) override
        // this explicitly to false.
        email_verified: true,
        name: 'Maria Silva',
        ...options.claims,
      };

      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: FAKE_IDP_KID })
        .setIssuedAt(claims.iat ?? now)
        .setExpirationTime(claims.exp ?? now + 300)
        .sign(options.signWithWrongKey ? wrongPrivateKey : privateKey);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id_token: idToken, access_token: 'fake-access-token', token_type: 'Bearer', expires_in: 3600 }));
      return;
    }

    res.statusCode = 404;
    res.end();
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind the fake IdP');
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    encodeCode: (options = {}) => Buffer.from(JSON.stringify(options)).toString('base64url'),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
