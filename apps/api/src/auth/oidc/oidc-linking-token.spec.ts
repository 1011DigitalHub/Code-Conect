import { mintLinkingToken, verifyLinkingToken } from './oidc-linking-token.js';

const claims = { email: 'maria@exemplo.com', provider: 'google' as const, providerSub: 'sub-123' };

describe('oidc-linking-token', () => {
  it('verifies a token it just minted and returns its claims', () => {
    const token = mintLinkingToken(claims);
    expect(verifyLinkingToken(token)).toEqual(claims);
  });

  it('rejects a missing or malformed token', () => {
    expect(verifyLinkingToken(undefined)).toBeUndefined();
    expect(verifyLinkingToken('not-a-token')).toBeUndefined();
    expect(verifyLinkingToken('a.b.c')).toBeUndefined();
  });

  it('rejects a token whose payload was tampered with (signature no longer matches)', () => {
    const token = mintLinkingToken(claims);
    const [encoded, mac] = token.split('.');
    const tamperedPayload = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf8'));
    tamperedPayload.email = 'attacker@exemplo.com';
    const tampered = `${Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')}.${mac}`;
    expect(verifyLinkingToken(tampered)).toBeUndefined();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    const token = mintLinkingToken(claims);
    vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute ttl
    expect(verifyLinkingToken(token)).toBeUndefined();
    vi.useRealTimers();
  });

  it('rejects a token signed with a different secret', () => {
    vi.stubEnv('OIDC_LINKING_TOKEN_SECRET', 'a'.repeat(32));
    const token = mintLinkingToken(claims);
    vi.stubEnv('OIDC_LINKING_TOKEN_SECRET', 'b'.repeat(32));
    expect(verifyLinkingToken(token)).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
