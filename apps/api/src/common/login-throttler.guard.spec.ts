import type { ExecutionContext } from '@nestjs/common';
import { AuthController } from '../auth/auth.controller.js';
import { OidcController } from '../auth/oidc/oidc.controller.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';

function contextFor(classRef: { name: string }, handlerName: string): ExecutionContext {
  return {
    getClass: () => classRef,
    getHandler: () => ({ name: handlerName }),
  } as unknown as ExecutionContext;
}

describe('LoginThrottlerGuard', () => {
  // generateKey is protected — only reachable through canActivate() otherwise,
  // which would need a real Reflector/storage. Casting to access it directly
  // tests the one thing this subclass actually changes, same shape as
  // ThrottlerGuard's own default (class+handler+name+tracker).
  const guard = new LoginThrottlerGuard(
    undefined as never,
    undefined as never,
    undefined as never,
  );
  const generateKey = (guard as unknown as { generateKey: (c: ExecutionContext, s: string, n: string) => string })
    .generateKey.bind(guard);

  // Uses the real controller classes (not string literals matching whatever
  // the guard happens to hardcode) — a rename of either handler would make
  // this fail to compile before it could fail to pass, closing the gap the
  // round-14 review flagged in the first version of this file.
  it('gives AuthController.login and OidcController.link the exact same key for the same IP', () => {
    const loginKey = generateKey(contextFor(AuthController, 'login'), '203.0.113.1', 'default');
    const linkKey = generateKey(contextFor(OidcController, 'link'), '203.0.113.1', 'default');
    expect(loginKey).toBe(linkKey);
  });

  it('still keys by IP, so two different IPs never share a bucket', () => {
    const first = generateKey(contextFor(AuthController, 'login'), '203.0.113.1', 'default');
    const second = generateKey(contextFor(OidcController, 'link'), '203.0.113.2', 'default');
    expect(first).not.toBe(second);
  });

  it('leaves every other route with its own, independent key (the default behavior)', () => {
    const signUp = generateKey(contextFor({ name: 'UsersController' }, 'create'), '203.0.113.1', 'default');
    const posts = generateKey(contextFor({ name: 'PostsController' }, 'create'), '203.0.113.1', 'default');
    const loginKey = generateKey(contextFor(AuthController, 'login'), '203.0.113.1', 'default');
    expect(signUp).not.toBe(posts);
    expect(signUp).not.toBe(loginKey);
    expect(posts).not.toBe(loginKey);
  });
});
