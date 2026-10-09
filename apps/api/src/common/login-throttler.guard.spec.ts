import type { ExecutionContext } from '@nestjs/common';
import { LoginThrottlerGuard } from './login-throttler.guard.js';

function contextFor(className: string, handlerName: string): ExecutionContext {
  return {
    getClass: () => ({ name: className }),
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

  it('gives AuthController.login and OidcController.link the exact same key for the same IP', () => {
    const loginKey = generateKey(contextFor('AuthController', 'login'), '203.0.113.1', 'default');
    const linkKey = generateKey(contextFor('OidcController', 'link'), '203.0.113.1', 'default');
    expect(loginKey).toBe(linkKey);
  });

  it('still keys by IP, so two different IPs never share a bucket', () => {
    const first = generateKey(contextFor('AuthController', 'login'), '203.0.113.1', 'default');
    const second = generateKey(contextFor('OidcController', 'link'), '203.0.113.2', 'default');
    expect(first).not.toBe(second);
  });

  it('leaves every other route with its own, independent key (the default behavior)', () => {
    const signUp = generateKey(contextFor('UsersController', 'create'), '203.0.113.1', 'default');
    const posts = generateKey(contextFor('PostsController', 'create'), '203.0.113.1', 'default');
    const loginKey = generateKey(contextFor('AuthController', 'login'), '203.0.113.1', 'default');
    expect(signUp).not.toBe(posts);
    expect(signUp).not.toBe(loginKey);
    expect(posts).not.toBe(loginKey);
  });
});
