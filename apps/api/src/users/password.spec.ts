import { hashPassword, verifyPassword } from './password.js';

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
});
