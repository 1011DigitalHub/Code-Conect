import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JwtPayload, SignInResult } from '../auth.types.js';
import { JWT_EXPIRES_IN_SECONDS } from '../auth.constants.js';
import { verifyUserPassword } from '../../users/password.js';
import { UsersService } from '../../users/users.service.js';
import { mintLinkingToken, verifyLinkingToken } from './oidc-linking-token.js';
import { getApiOrigin, getOidcProviderConfig, type OidcProvider } from './oidc.constants.js';
import type { IdentityResolution, OidcIdentityClaims } from './oidc.types.js';

// One remote JWKS set per endpoint URL, created once and reused for the
// process's lifetime: jose's own cache (and its cooldownDuration, below)
// only dedupes/throttles refetches across calls made against the *same*
// instance — a fresh instance per request would both lose the cache and
// never engage the cooldown.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    // cooldownDuration is the actual defence against a malicious id_token
    // with a bogus/unknown `kid` forcing a refetch on every request — jose
    // refuses to hit jwks_uri again for 30s after a fetch, no matter how
    // many unknown kids it's asked to resolve in that window (see
    // plan/LoginSocial.md's JWKS DoS checklist item).
    jwks = createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 30_000 });
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

function buildRedirectUri(provider: OidcProvider): string {
  return `${getApiOrigin()}/auth/oidc/${provider}/callback`;
}

@Injectable()
export class OidcService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  buildAuthorizationUrl(provider: OidcProvider, state: string, codeChallenge: string): string {
    const config = getOidcProviderConfig(provider);
    const url = new URL(config.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', buildRedirectUri(provider));
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  // Exchanges the authorization code for an id_token, sending code_verifier
  // as proof of possession of the PKCE pair minted in /start — this is what
  // actually closes the authorization-code-interception attack, not
  // anything the API itself double-checks afterwards.
  private async exchangeCodeForIdToken(
    provider: OidcProvider,
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const config = getOidcProviderConfig(provider);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: buildRedirectUri(provider),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new BadRequestException('Não foi possível concluir o login com o provedor');
    }
    if (!response.ok) {
      throw new BadRequestException('Não foi possível concluir o login com o provedor');
    }

    const tokens = (await response.json().catch(() => undefined)) as { id_token?: unknown } | undefined;
    if (!tokens || typeof tokens.id_token !== 'string') {
      throw new BadRequestException('O provedor não retornou um id_token');
    }
    return tokens.id_token;
  }

  private async verifyIdToken(provider: OidcProvider, idToken: string): Promise<OidcIdentityClaims> {
    const config = getOidcProviderConfig(provider);

    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      const result = await jwtVerify(idToken, getJwks(config.jwksUri), {
        audience: config.clientId,
        algorithms: ['RS256', 'ES256'],
        // 1-2 minutes of clock skew, per plan/LoginSocial.md — covers exp,
        // iat and nbf all at once (jose applies the same tolerance to each).
        clockTolerance: 120,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException('Não foi possível validar o login do provedor');
    }

    // Issuer isn't part of the jwtVerify() call above: Microsoft's
    // multi-tenant "common" endpoint issues tokens whose `iss` embeds the
    // actual tenant id, so there is no single fixed string to pass as the
    // `issuer` option — see OidcProviderConfig.validateIssuer.
    if (typeof payload.iss !== 'string' || !config.validateIssuer(payload.iss)) {
      throw new UnauthorizedException('Não foi possível validar o login do provedor');
    }
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !payload.email) {
      throw new UnauthorizedException('O provedor não retornou os dados necessários');
    }

    const email = payload.email.toLowerCase();
    const name =
      typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0] || email;
    return { sub: payload.sub, email, name };
  }

  async authenticate(provider: OidcProvider, code: string, codeVerifier: string): Promise<IdentityResolution> {
    const idToken = await this.exchangeCodeForIdToken(provider, code, codeVerifier);
    const claims = await this.verifyIdToken(provider, idToken);
    return this.resolveIdentity(provider, claims);
  }

  // Three-way split, per plan/LoginSocial.md section 4:
  //  1. This exact (provider, sub) is already linked -> sign in as that user.
  //  2. No user has this email yet -> create one (no local password).
  //  3. A user has this email: if they have no local password either (an
  //     OIDC-only account, already proven to control this mailbox by some
  //     provider), link this identity too, no extra proof needed. If they
  //     DO have a local password, this is the collision the plan's account-
  //     linking flow exists for — never auto-merge.
  private async resolveIdentity(provider: OidcProvider, claims: OidcIdentityClaims): Promise<IdentityResolution> {
    const byIdentity = await this.usersService.findByProviderIdentity(provider, claims.sub);
    if (byIdentity) return { kind: 'signedIn', user: byIdentity };

    const byEmail = await this.usersService.findByEmail(claims.email);
    if (!byEmail) {
      const created = await this.usersService.createFromOidc({
        name: claims.name,
        email: claims.email,
        provider,
        providerSub: claims.sub,
      });
      return { kind: 'signedIn', user: created };
    }

    if (byEmail.passwordHash === null) {
      await this.usersService.linkProviderIdentity(byEmail.id, provider, claims.sub);
      return { kind: 'signedIn', user: byEmail };
    }

    const linkingToken = mintLinkingToken({ email: byEmail.email, provider, providerSub: claims.sub });
    return { kind: 'linkingRequired', linkingToken };
  }

  // POST /auth/oidc/link: the linking_token (from the cookie, never the
  // body/query — see oidc-flow-cookie.ts's sibling) proves which (provider,
  // email) pair is trying to link; the password proves the person submitting
  // the form actually controls the existing local account. Both must hold.
  async linkAccount(linkingToken: string | undefined, password: string): Promise<SignInResult> {
    const claims = verifyLinkingToken(linkingToken);
    // Same generic failure for an invalid/expired token and a wrong
    // password below — see oidc-linking-token.ts's doc comment on why the
    // two must stay indistinguishable to the caller.
    if (!claims) {
      throw new UnauthorizedException('Não foi possível concluir a vinculação');
    }

    const user = await this.usersService.findByEmail(claims.email);
    const passwordIsValid = await verifyUserPassword(user, password);
    if (!user || !passwordIsValid) {
      throw new UnauthorizedException('Não foi possível concluir a vinculação');
    }

    await this.usersService.linkProviderIdentity(user.id, claims.provider, claims.providerSub);
    return this.mintSession(user);
  }

  async mintSession(user: { id: number; email: string }): Promise<SignInResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn: JWT_EXPIRES_IN_SECONDS }),
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }
}
