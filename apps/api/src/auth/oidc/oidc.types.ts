import type { StoredUser } from '../../users/entities/user.entity.js';

// What the authorization endpoint sends back as claims, after the id_token's
// signature, issuer, audience and timestamps have all already checked out.
export interface OidcIdentityClaims {
  sub: string;
  email: string;
  name: string;
  // Whether the provider itself asserts ownership of this mailbox. Without
  // this, auto-linking a second OIDC identity to an existing passwordless
  // account by email match alone is the "nOAuth" account-takeover shape: a
  // provider that lets a user set an arbitrary, unverified email (some
  // Microsoft Entra ID tenants do) would otherwise be enough to take over
  // any OIDC-only account that happens to share that email — see
  // OidcService.resolveIdentity.
  emailVerified: boolean;
}

// The linking case carries a ready-to-use, already-signed linkingToken
// rather than the raw email/providerSub: the controller only needs to set a
// cookie and redirect, not know anything about how that token is built (see
// oidc-linking-token.ts).
export type IdentityResolution =
  | { kind: 'signedIn'; user: StoredUser }
  | { kind: 'linkingRequired'; linkingToken: string };
