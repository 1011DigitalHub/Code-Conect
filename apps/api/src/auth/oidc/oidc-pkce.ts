import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Compares the callback's ?state= query param against the one stashed in
// the oidc_flow cookie. Same length-then-timingSafeEqual shape as
// csrf.ts's verifyCsrfToken — crypto.timingSafeEqual throws on a length
// mismatch rather than returning false, so that check has to come first.
export function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
