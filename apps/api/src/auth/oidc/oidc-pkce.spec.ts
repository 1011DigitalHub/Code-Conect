import { createHash } from 'node:crypto';
import { generatePkcePair, generateState, statesMatch } from './oidc-pkce.js';

describe('oidc-pkce', () => {
  describe('generateState', () => {
    it('generates a random, non-empty value that differs on each call', () => {
      const a = generateState();
      const b = generateState();
      expect(a).not.toBe('');
      expect(a).not.toBe(b);
    });
  });

  describe('generatePkcePair', () => {
    it('derives code_challenge as base64url(sha256(code_verifier)), per RFC 7636 S256', () => {
      const { codeVerifier, codeChallenge } = generatePkcePair();
      const expected = createHash('sha256').update(codeVerifier).digest('base64url');
      expect(codeChallenge).toBe(expected);
    });

    it('generates a different pair on each call', () => {
      const a = generatePkcePair();
      const b = generatePkcePair();
      expect(a.codeVerifier).not.toBe(b.codeVerifier);
    });
  });

  describe('statesMatch', () => {
    it('is true for identical strings', () => {
      expect(statesMatch('abc', 'abc')).toBe(true);
    });

    it('is false for different strings, including a length mismatch', () => {
      expect(statesMatch('abc', 'abd')).toBe(false);
      expect(statesMatch('abc', 'abcd')).toBe(false);
      expect(statesMatch('abc', '')).toBe(false);
    });
  });
});
