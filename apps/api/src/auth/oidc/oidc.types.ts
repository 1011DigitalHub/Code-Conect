import type { StoredUser } from '../../users/entities/user.entity.js';

// What the authorization endpoint sends back as claims, after the id_token's
// signature, issuer, audience and timestamps have all already checked out.
export interface OidcIdentityClaims {
  sub: string;
  email: string;
  name: string;
}

// The linking case carries a ready-to-use, already-signed linkingToken
// rather than the raw email/providerSub: the controller only needs to set a
// cookie and redirect, not know anything about how that token is built (see
// oidc-linking-token.ts).
export type IdentityResolution =
  | { kind: 'signedIn'; user: StoredUser }
  | { kind: 'linkingRequired'; linkingToken: string };
