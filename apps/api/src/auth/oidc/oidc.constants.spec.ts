import { BadRequestException } from '@nestjs/common';
import { getApiOrigin, getOidcProviderConfig, getWebAppOrigin, isOidcProvider, parseOidcProvider } from './oidc.constants.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isOidcProvider / parseOidcProvider', () => {
  it('accepts exactly google and microsoft', () => {
    expect(isOidcProvider('google')).toBe(true);
    expect(isOidcProvider('microsoft')).toBe(true);
    expect(isOidcProvider('github')).toBe(false);
  });

  it('parses a valid provider and rejects anything else with a 400, not a default', () => {
    expect(parseOidcProvider('google')).toBe('google');
    expect(() => parseOidcProvider('github')).toThrow(BadRequestException);
    expect(() => parseOidcProvider('')).toThrow(BadRequestException);
  });
});

describe('getOidcProviderConfig', () => {
  it('defaults to the real Google/Microsoft endpoints', () => {
    const google = getOidcProviderConfig('google');
    expect(google.authorizationEndpoint).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.jwksUri).toBe('https://www.googleapis.com/oauth2/v3/certs');

    const microsoft = getOidcProviderConfig('microsoft');
    expect(microsoft.tokenEndpoint).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
  });

  it('lets every endpoint be overridden by env (what the e2e fake IdP relies on)', () => {
    vi.stubEnv('GOOGLE_AUTHORIZATION_ENDPOINT', 'http://localhost:9/authorize');
    vi.stubEnv('GOOGLE_TOKEN_ENDPOINT', 'http://localhost:9/token');
    vi.stubEnv('GOOGLE_JWKS_URI', 'http://localhost:9/jwks');
    const google = getOidcProviderConfig('google');
    expect(google.authorizationEndpoint).toBe('http://localhost:9/authorize');
    expect(google.tokenEndpoint).toBe('http://localhost:9/token');
    expect(google.jwksUri).toBe('http://localhost:9/jwks');
  });

  it('reads the client id/secret from the provider-specific env vars', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-secret');
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'm-id');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'm-secret');
    expect(getOidcProviderConfig('google')).toMatchObject({ clientId: 'g-id', clientSecret: 'g-secret' });
    expect(getOidcProviderConfig('microsoft')).toMatchObject({ clientId: 'm-id', clientSecret: 'm-secret' });
  });

  describe('validateIssuer', () => {
    it("google accepts both documented forms of its issuer (or GOOGLE_ISSUER's override)", () => {
      const config = getOidcProviderConfig('google');
      expect(config.validateIssuer('https://accounts.google.com')).toBe(true);
      // Google's own docs: some id_tokens send `iss` without the scheme —
      // https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken
      expect(config.validateIssuer('accounts.google.com')).toBe(true);
      expect(config.validateIssuer('https://evil.example.com')).toBe(false);
    });

    it('microsoft accepts any tenant guid under the real pattern, by default', () => {
      const config = getOidcProviderConfig('microsoft');
      expect(
        config.validateIssuer('https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'),
      ).toBe(true);
      expect(config.validateIssuer('https://login.microsoftonline.com/common/v2.0')).toBe(false);
      expect(config.validateIssuer('https://attacker.example.com/v2.0')).toBe(false);
    });

    it('microsoft uses MICROSOFT_ISSUER verbatim when set (the e2e fake IdP)', () => {
      vi.stubEnv('MICROSOFT_ISSUER', 'http://localhost:9/fake-issuer');
      const config = getOidcProviderConfig('microsoft');
      expect(config.validateIssuer('http://localhost:9/fake-issuer')).toBe(true);
      expect(
        config.validateIssuer('https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'),
      ).toBe(false);
    });

    // Round 12 of plan/LoginSocial.md's review: a test-only override left
    // set in a production environment must never swap out what an id_token
    // is actually checked against.
    it('ignores every test override in production — endpoints and issuers both fall back to the real ones', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('GOOGLE_AUTHORIZATION_ENDPOINT', 'http://localhost:9/authorize');
      vi.stubEnv('GOOGLE_ISSUER', 'https://evil.example.com');
      vi.stubEnv('MICROSOFT_ISSUER', 'https://evil.example.com');

      const google = getOidcProviderConfig('google');
      expect(google.authorizationEndpoint).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(google.validateIssuer('https://evil.example.com')).toBe(false);
      expect(google.validateIssuer('https://accounts.google.com')).toBe(true);

      const microsoft = getOidcProviderConfig('microsoft');
      expect(microsoft.validateIssuer('https://evil.example.com')).toBe(false);
      expect(
        microsoft.validateIssuer('https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'),
      ).toBe(true);
    });
  });
});

describe('getApiOrigin / getWebAppOrigin', () => {
  it('default to the dev origins and read the env override', () => {
    expect(getApiOrigin()).toBe('http://localhost:3000');
    expect(getWebAppOrigin()).toBe('http://localhost:5173');

    vi.stubEnv('API_ORIGIN', 'https://api.exemplo.com');
    vi.stubEnv('WEB_APP_ORIGIN', 'https://exemplo.com');
    expect(getApiOrigin()).toBe('https://api.exemplo.com');
    expect(getWebAppOrigin()).toBe('https://exemplo.com');
  });
});
