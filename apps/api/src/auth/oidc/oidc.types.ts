import type { StoredUser } from '../../users/entities/user.entity.js';

// What the authorization endpoint sends back as claims, after the id_token's
// signature, issuer, audience and timestamps have all already checked out.
export interface OidcIdentityClaims {
  sub: string;
  email: string;
  name: string;
  // Whether the provider itself asserts ownership of this mailbox —
  // id_token's `email_verified`, or Microsoft's `xms_edov` when that's what
  // the provider sends instead (see OidcService.verifyIdToken). Without
  // this, auto-linking a second OIDC identity (or creating a brand-new
  // account) by email match alone is the "nOAuth" account-takeover shape: a
  // provider that lets a user set an arbitrary, unverified email (some
  // Microsoft Entra ID tenants do) would otherwise be enough to take over,
  // or pre-register, any account sharing that email — see
  // OidcService.resolveIdentity.
  emailVerified: boolean;
}

// The linking case carries a ready-to-use, already-signed linkingToken
// rather than the raw email/providerSub: the controller only needs to set a
// cookie and redirect, not know anything about how that token is built (see
// oidc-linking-token.ts).
//
// `user` is typed without passwordHash, not as the full StoredUser: two of
// resolveIdentity's three branches (findByProviderIdentity, createFromOidc)
// return a User PrismaService's global omit has already stripped it from,
// so the field would be `undefined` at runtime despite StoredUser's own
// `string | null` claiming it's always present. The third branch
// (byEmail, from findByEmail) returns the full StoredUser, which is still
// assignable here — this is the narrower of the two shapes, not a
// separate one.
export type IdentityResolution =
  | { kind: 'signedIn'; user: Omit<StoredUser, 'passwordHash'> }
  | { kind: 'linkingRequired'; linkingToken: string };
