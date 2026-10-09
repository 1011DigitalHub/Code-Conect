import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { DUMMY_HASH, hashPassword, shouldRehash, verifyPassword, verifyUserPassword } from './password.js';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Builds a hash in the legacy, unversioned format this module replaced
// ("<saltHex>:<hashHex>", Node's scrypt defaults N=16384,r=8,p=1), the same
// shape every account created before this change has stored.
async function legacyHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

describe('password', () => {
  it('does not store the plain password', async () => {
    const hash = await hashPassword('senha-segura-123');
    expect(hash).not.toContain('senha-segura-123');
  });

  it('uses a different salt for each hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('senha-segura-123'),
      hashPassword('senha-segura-123'),
    ]);
    expect(a).not.toBe(b);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('senha-segura-123');
    await expect(verifyPassword('senha-segura-123', hash)).resolves.toBe(true);
    await expect(verifyPassword('outra-senha', hash)).resolves.toBe(false);
  });

  it('rejects a malformed stored value', async () => {
    await expect(verifyPassword('x', 'invalid')).resolves.toBe(false);
  });

  it('stores the cost parameters in the versioned format', async () => {
    const hash = await hashPassword('senha-segura-123');
    expect(hash).toMatch(/^scrypt\$N=131072,r=8,p=1\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it('still verifies a legacy, unversioned hash', async () => {
    const hash = await legacyHash('senha-segura-123');
    await expect(verifyPassword('senha-segura-123', hash)).resolves.toBe(true);
    await expect(verifyPassword('outra-senha', hash)).resolves.toBe(false);
  });

  describe('verifyUserPassword', () => {
    it('accepts the right password for a user with a hash', async () => {
      const passwordHash = await hashPassword('senha-segura-123');
      await expect(
        verifyUserPassword({ passwordHash }, 'senha-segura-123'),
      ).resolves.toBe(true);
    });

    // A null passwordHash is exactly what a user created via OIDC has (see
    // plan/LoginSocial.md) — no local password to compare against, so this
    // falls back to DUMMY_HASH and always rejects, the same way an unknown
    // email does, rather than throwing or short-circuiting to true.
    it('rejects a user with a null passwordHash, same as an unknown email, against the same DUMMY_HASH a missing user falls back to', async () => {
      await expect(verifyUserPassword({ passwordHash: null }, 'whatever')).resolves.toBe(
        await verifyPassword('whatever', DUMMY_HASH),
      );
      await expect(verifyUserPassword(null, 'whatever')).resolves.toBe(false);
    });
  });

  describe('shouldRehash', () => {
    it('is false for a hash at the current cost', async () => {
      const hash = await hashPassword('senha-segura-123');
      expect(shouldRehash(hash)).toBe(false);
    });

    it('is true for a legacy, unversioned hash', async () => {
      const hash = await legacyHash('senha-segura-123');
      expect(shouldRehash(hash)).toBe(true);
    });

    it('is true for a versioned hash at a weaker cost', () => {
      expect(shouldRehash('scrypt$N=16384,r=8,p=1$aa$bb')).toBe(true);
    });

    it('is true for a malformed value (so verifyPassword failing is the real signal)', () => {
      expect(shouldRehash('not-a-hash')).toBe(true);
    });
  });
});
