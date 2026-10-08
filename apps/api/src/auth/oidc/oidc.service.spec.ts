import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jwtVerify } from 'jose';
import type { UsersService } from '../../users/users.service.js';
import { verifyLinkingToken } from './oidc-linking-token.js';
import { OidcService } from './oidc.service.js';

// jwtVerify is the one piece of real cryptography this file doesn't want to
// re-prove (jose has its own test suite) — this unit test controls exactly
// what it returns/throws to drive OidcService's own branching. The real
// signature/JWKS verification is exercised end-to-end against a local fake
// IdP in test/oidc.e2e-spec.ts, which is where a forged signature or a
// wrong aud actually has to fail for a real reason.
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

function fetchJsonOnce(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }),
  );
}

describe('OidcService', () => {
  let service: OidcService;
  let usersService: {
    findByProviderIdentity: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
    createFromOidc: ReturnType<typeof vi.fn>;
    linkProviderIdentity: ReturnType<typeof vi.fn>;
  };
  let jwtService: JwtService;

  beforeEach(() => {
    vi.resetAllMocks();
    usersService = {
      findByProviderIdentity: vi.fn(),
      findByEmail: vi.fn(),
      createFromOidc: vi.fn(),
      linkProviderIdentity: vi.fn(),
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new OidcService(usersService as unknown as UsersService, jwtService);
  });

  describe('buildAuthorizationUrl', () => {
    it('builds the authorization URL with PKCE, state and the fixed scope', () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'client-123');
      const url = new URL(service.buildAuthorizationUrl('google', 'state-abc', 'challenge-xyz'));

      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('client-123');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('state')).toBe('state-abc');
      expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/oidc/google/callback');
    });
  });

  describe('authenticate', () => {
    it('rejects when the token exchange fails', async () => {
      fetchJsonOnce({}, false);
      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when the provider returns no id_token', async () => {
      fetchJsonOnce({ access_token: 'x' });
      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when jose cannot verify the id_token (bad signature, wrong alg, ...)', async () => {
      fetchJsonOnce({ id_token: 'bad-token' });
      vi.mocked(jwtVerify).mockRejectedValue(new Error('signature verification failed'));

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an id_token whose issuer does not match the provider', async () => {
      fetchJsonOnce({ id_token: 'token' });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: { iss: 'https://attacker.example.com', sub: 's1', email: 'maria@exemplo.com' },
      } as never);

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an id_token whose email is over the 254-character column width', async () => {
      fetchJsonOnce({ id_token: 'token' });
      const overLongEmail = `${'a'.repeat(250)}@example.com`; // > 254 chars
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: { iss: 'https://accounts.google.com', sub: 's1', email: overLongEmail, email_verified: true },
      } as never);

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('truncates a name over the 100-character column width instead of failing createFromOidc', async () => {
      fetchJsonOnce({ id_token: 'token' });
      const overLongName = 'a'.repeat(150);
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          iss: 'https://accounts.google.com',
          sub: 's1',
          email: 'maria@exemplo.com',
          name: overLongName,
          email_verified: true,
        },
      } as never);
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createFromOidc.mockResolvedValue({ id: 5 });

      await service.authenticate('google', 'code', 'verifier');

      const call = usersService.createFromOidc.mock.calls[0]![0] as { name: string };
      expect(call.name).toHaveLength(100);
      expect(call.name).toBe('a'.repeat(100));
    });

    it('rejects an id_token missing sub or email', async () => {
      fetchJsonOnce({ id_token: 'token' });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: { iss: 'https://accounts.google.com', sub: 's1' },
      } as never);

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    function mockValidToken(claims: {
      sub: string;
      email: string;
      name?: string;
      email_verified?: boolean;
    }) {
      fetchJsonOnce({ id_token: 'token' });
      vi.mocked(jwtVerify).mockResolvedValue({
        // email_verified defaults to true: only the auto-link assertions
        // below care about it, everything else exercises paths that don't
        // depend on it at all.
        payload: { iss: 'https://accounts.google.com', email_verified: true, ...claims },
      } as never);
    }

    it('signs in directly when (provider, sub) already maps to a user', async () => {
      mockValidToken({ sub: 'sub-1', email: 'maria@exemplo.com' });
      const user = { id: 1, email: 'maria@exemplo.com', passwordHash: null };
      usersService.findByProviderIdentity.mockResolvedValue(user);

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(resolution).toEqual({ kind: 'signedIn', user });
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('creates a new user when no identity and no email collision exist', async () => {
      mockValidToken({ sub: 'sub-1', email: 'maria@exemplo.com', name: 'Maria Silva' });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      const created = { id: 5, email: 'maria@exemplo.com', passwordHash: null };
      usersService.createFromOidc.mockResolvedValue(created);

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(usersService.createFromOidc).toHaveBeenCalledWith({
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        provider: 'google',
        providerSub: 'sub-1',
      });
      expect(resolution).toEqual({ kind: 'signedIn', user: created });
    });

    // A pre-registration attack: a provider that hands out an arbitrary,
    // unverified email would otherwise let an attacker claim the victim's
    // email *before* the victim ever signs up, planting an account that
    // later auto-links the victim's own, legitimately-verified login from
    // a trustworthy provider into the attacker's planted one.
    it('refuses to create a brand-new account when the email is not verified', async () => {
      mockValidToken({ sub: 'sub-attacker', email: 'vitima@exemplo.com', email_verified: false });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.createFromOidc).not.toHaveBeenCalled();
    });

    it('falls back to the email local-part as the name when the provider sends none', async () => {
      mockValidToken({ sub: 'sub-1', email: 'maria@exemplo.com' });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createFromOidc.mockResolvedValue({ id: 5 });

      await service.authenticate('google', 'code', 'verifier');

      expect(usersService.createFromOidc).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'maria' }),
      );
    });

    it('auto-links a second provider identity to an existing OIDC-only account when the email is verified', async () => {
      mockValidToken({ sub: 'sub-2', email: 'maria@exemplo.com', email_verified: true });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      const existing = { id: 5, email: 'maria@exemplo.com', passwordHash: null };
      usersService.findByEmail.mockResolvedValue(existing);

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(usersService.linkProviderIdentity).toHaveBeenCalledWith(5, 'google', 'sub-2');
      expect(resolution).toEqual({ kind: 'signedIn', user: existing });
    });

    // The nOAuth account-takeover shape: a provider that lets a user set an
    // arbitrary, unverified email on their own account would otherwise be
    // enough to take over any OIDC-only account sharing it, with no proof
    // of anything — see OidcService.resolveIdentity. There is also no
    // password to fall back to here (passwordHash is null), so this must
    // fail closed rather than silently merge or route to an uncompletable
    // linking form.
    it.each([
      ['false', false],
      ['missing', undefined],
      ['a non-boolean truthy string', 'yes'],
    ])('refuses to auto-link an OIDC-only account when email_verified is %s', async (_label, emailVerified) => {
      mockValidToken({ sub: 'sub-2', email: 'maria@exemplo.com', email_verified: emailVerified as never });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue({ id: 5, email: 'maria@exemplo.com', passwordHash: null });

      await expect(service.authenticate('google', 'code', 'verifier')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.linkProviderIdentity).not.toHaveBeenCalled();
    });

    // Microsoft Entra ID's v2.0 endpoint doesn't reliably send
    // email_verified at all — its own nOAuth mitigation is the `xms_edov`
    // optional claim instead (see OidcService.verifyIdToken and
    // plan/LoginSocial.md). Without accepting this too, Microsoft
    // signup/auto-link would always fail closed even when the tenant is
    // correctly configured to assert domain ownership.
    it('accepts xms_edov as an alternative to email_verified (Microsoft)', async () => {
      mockValidToken({
        sub: 'sub-2',
        email: 'maria@exemplo.com',
        email_verified: false,
        xms_edov: true,
        iss: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
      } as never);
      usersService.findByProviderIdentity.mockResolvedValue(null);
      const existing = { id: 5, email: 'maria@exemplo.com', passwordHash: null };
      usersService.findByEmail.mockResolvedValue(existing);

      const resolution = await service.authenticate('microsoft', 'code', 'verifier');

      expect(resolution).toEqual({ kind: 'signedIn', user: existing });
    });

    it('accepts email_verified sent as the string "true" (some providers do this)', async () => {
      mockValidToken({ sub: 'sub-2', email: 'maria@exemplo.com', email_verified: 'true' as never });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      const existing = { id: 5, email: 'maria@exemplo.com', passwordHash: null };
      usersService.findByEmail.mockResolvedValue(existing);

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(resolution).toEqual({ kind: 'signedIn', user: existing });
    });

    it('never auto-merges into an existing local, password-protected account — returns a linkingToken instead', async () => {
      mockValidToken({ sub: 'sub-2', email: 'maria@exemplo.com' });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      const existing = { id: 5, email: 'maria@exemplo.com', passwordHash: 'scrypt$...' };
      usersService.findByEmail.mockResolvedValue(existing);

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(usersService.linkProviderIdentity).not.toHaveBeenCalled();
      expect(resolution.kind).toBe('linkingRequired');
      if (resolution.kind !== 'linkingRequired') throw new Error('unreachable');
      expect(verifyLinkingToken(resolution.linkingToken)).toEqual({
        email: 'maria@exemplo.com',
        provider: 'google',
        providerSub: 'sub-2',
      });
    });

    // The password-confirmed linking path is safe regardless of
    // email_verified — completing it still requires the real account's
    // actual password (see linkAccount below), which an unverified email
    // claim alone never grants. This is the one resolveIdentity branch the
    // emailVerified gate deliberately does NOT cover.
    it('still offers the linking form for an unverified email, when the existing account has a local password', async () => {
      mockValidToken({ sub: 'sub-2', email: 'maria@exemplo.com', email_verified: false });
      usersService.findByProviderIdentity.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue({ id: 5, email: 'maria@exemplo.com', passwordHash: 'scrypt$...' });

      const resolution = await service.authenticate('google', 'code', 'verifier');

      expect(resolution.kind).toBe('linkingRequired');
      expect(usersService.linkProviderIdentity).not.toHaveBeenCalled();
    });
  });

  describe('linkAccount', () => {
    it('rejects a missing or invalid linking_token', async () => {
      await expect(service.linkAccount(undefined, 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.linkAccount('not-a-token', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password with the same generic error as an invalid token', async () => {
      const { mintLinkingToken } = await import('./oidc-linking-token.js');
      const token = mintLinkingToken({ email: 'maria@exemplo.com', provider: 'google', providerSub: 's1' });
      usersService.findByEmail.mockResolvedValue({ id: 1, email: 'maria@exemplo.com', passwordHash: 'scrypt$N=131072,r=8,p=1$aa$bb' });

      await expect(service.linkAccount(token, 'senha-errada')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.linkProviderIdentity).not.toHaveBeenCalled();
    });

    it('links the identity and mints a session on a correct password', async () => {
      const { mintLinkingToken } = await import('./oidc-linking-token.js');
      const { hashPassword } = await import('../../users/password.js');
      const token = mintLinkingToken({ email: 'maria@exemplo.com', provider: 'google', providerSub: 's1' });
      usersService.findByEmail.mockResolvedValue({
        id: 1,
        email: 'maria@exemplo.com',
        passwordHash: await hashPassword('senha-segura-123'),
      });

      const session = await service.linkAccount(token, 'senha-segura-123');

      expect(usersService.linkProviderIdentity).toHaveBeenCalledWith(1, 'google', 's1');
      expect(session.tokenType).toBe('Bearer');
      const payload = await jwtService.verifyAsync<{ sub: number; email: string }>(session.accessToken);
      expect(payload).toMatchObject({ sub: 1, email: 'maria@exemplo.com' });
    });
  });

  describe('mintSession', () => {
    it('signs a JWT carrying only sub and email', async () => {
      const session = await service.mintSession({ id: 42, email: 'ana@exemplo.com' });
      const payload = await jwtService.verifyAsync<Record<string, unknown>>(session.accessToken);
      expect(payload).toMatchObject({ sub: 42, email: 'ana@exemplo.com' });
      expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'sub']);
    });
  });
});
