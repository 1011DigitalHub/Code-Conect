import type { SocialProvider } from '../components/organisms/SocialLogin'

// Social sign-in options shared by the auth pages. These two ids must match
// the API's OidcProvider union (apps/api/src/auth/oidc/oidc.constants.ts) —
// see plan/LoginSocial.md for why only Google and Microsoft are supported.
export const socialProviders: SocialProvider[] = [
  { id: 'google', name: 'Google', icon: '/icons/google.svg' },
  { id: 'microsoft', name: 'Microsoft', icon: '/icons/microsoft.svg' },
]
