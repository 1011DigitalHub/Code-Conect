import { BadRequestException } from '@nestjs/common';

const DEV_LINKING_SECRET = 'dev-only-linking-secret-change-me';

export const OIDC_PROVIDERS = ['google', 'microsoft'] as const;
export type OidcProvider = (typeof OIDC_PROVIDERS)[number];

export function isOidcProvider(value: string): value is OidcProvider {
  return (OIDC_PROVIDERS as readonly string[]).includes(value);
}

// Shared by both GET handlers in OidcController: an unknown :provider is a
// 400 before anything else runs — no default provider, no attempt to build
// a URL out of it.
export function parseOidcProvider(value: string): OidcProvider {
  if (!isOidcProvider(value)) {
    throw new BadRequestException(`Provedor inválido: ${value}`);
  }
  return value;
}

// The fixed, per-environment base URL the redirect_uri is built from — see
// plan/LoginSocial.md section 2. Never taken from the request.
export function getApiOrigin(): string {
  return process.env.API_ORIGIN || 'http://localhost:3000';
}

// The API and the web app are different origins — a relative redirect after
// the callback would navigate within the API's own origin, not the SPA's.
export function getWebAppOrigin(): string {
  return process.env.WEB_APP_ORIGIN || 'http://localhost:5173';
}

// Never the same secret as the session JWT or the CSRF double-submit token:
// this one signs both the linking_token (the artifact that proves "this
// OIDC identity belongs to this email" across the redirect to
// /vincular-conta) and, since round 8 of plan/LoginSocial.md's review, the
// oidc_flow cookie (see oidc-flow-cookie.ts) — each with its own
// domain-separation prefix, same convention as csrf.ts sharing CSRF_SECRET
// across its own uses. A shared secret with JWT_SECRET/CSRF_SECRET would
// mean a leak of either of those doubles as a way to forge this proof.
export function getOidcLinkingTokenSecret(): string {
  return process.env.OIDC_LINKING_TOKEN_SECRET || DEV_LINKING_SECRET;
}

export interface OidcProviderConfig {
  readonly id: OidcProvider;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  // Google's issuer is a single fixed string. Microsoft's "common"
  // multi-tenant endpoint issues tokens whose `iss` embeds the signed-in
  // user's actual tenant id (https://login.microsoftonline.com/<tenant
  // guid>/v2.0) — there is no single fixed string to compare against, so
  // this is a predicate instead of a plain value.
  readonly validateIssuer: (iss: string) => boolean;
}

// Endpoints are the stable, documented OIDC endpoints for each provider —
// not fetched from discovery at request time, which would add a network
// round trip and a cache-invalidation problem for no real benefit here (they
// essentially never change). Each is still overridable by an env var so the
// e2e suite can point every one of them at a local fake IdP instead of the
// real Google/Microsoft — see test/oidc-fake-idp.ts. Ignored outright in
// production (round 12 of plan/LoginSocial.md's review): these vars exist
// only for tests, and a leftover one in a production environment (a stale
// CI/staging value retained in a secrets manager, say) would silently swap
// out the trust root an id_token is checked against — the one thing in this
// whole flow that must never be configurable by accident.
function testOverride(envVar: string): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return process.env[envVar] || undefined;
}

function endpoint(envVar: string, fallback: string): string {
  return testOverride(envVar) || fallback;
}

const MICROSOFT_ISSUER_PATTERN =
  /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i;

// Google documents that `iss` may come back as either form — some id_tokens
// omit the scheme — so both are the real, legitimate default, not a
// leniency hole. See https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Built fresh on every call (never cached in a module-level const): called
// per request in production, which costs nothing (these are just
// process.env reads), and it's what lets the e2e suite point every endpoint
// at a local fake IdP via env vars set *after* this module is first
// imported — the same reasoning as getJwtSecret()/getCsrfSecret() being
// called per use instead of captured once.
function buildProviderConfig(provider: OidcProvider): OidcProviderConfig {
  if (provider === 'google') {
    return {
      id: 'google',
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorizationEndpoint: endpoint(
        'GOOGLE_AUTHORIZATION_ENDPOINT',
        'https://accounts.google.com/o/oauth2/v2/auth',
      ),
      tokenEndpoint: endpoint('GOOGLE_TOKEN_ENDPOINT', 'https://oauth2.googleapis.com/token'),
      jwksUri: endpoint('GOOGLE_JWKS_URI', 'https://www.googleapis.com/oauth2/v3/certs'),
      validateIssuer: (iss) => {
        const override = testOverride('GOOGLE_ISSUER');
        return override ? iss === override : GOOGLE_ISSUERS.includes(iss);
      },
    };
  }

  return {
    id: 'microsoft',
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    authorizationEndpoint: endpoint(
      'MICROSOFT_AUTHORIZATION_ENDPOINT',
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    ),
    tokenEndpoint: endpoint(
      'MICROSOFT_TOKEN_ENDPOINT',
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    ),
    jwksUri: endpoint(
      'MICROSOFT_JWKS_URI',
      'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    ),
    // A test overriding the other endpoints also sets MICROSOFT_ISSUER (the
    // fake IdP mints tokens with a fixed test issuer), rather than trying to
    // satisfy the real tenant-id pattern.
    validateIssuer: (iss) => {
      const override = testOverride('MICROSOFT_ISSUER');
      return override ? iss === override : MICROSOFT_ISSUER_PATTERN.test(iss);
    },
  };
}

export function getOidcProviderConfig(provider: OidcProvider): OidcProviderConfig {
  return buildProviderConfig(provider);
}
