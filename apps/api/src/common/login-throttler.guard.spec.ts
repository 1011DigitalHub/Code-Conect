import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthController } from '../auth/auth.controller.js';
import { OidcController } from '../auth/oidc/oidc.controller.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';

// handlerRef is the actual method (e.g. AuthController.prototype.login), the
// same value a real ExecutionContext.getHandler() would return — exercising
// the guard's real Reflector.get() lookup against the @ThrottleBucket
// metadata the decorator set at class-definition time.
/* oxlint-disable typescript/unbound-method */
function contextFor(classRef: { name: string }, handlerRef: Function): ExecutionContext {
  return {
    getClass: () => classRef,
    getHandler: () => handlerRef,
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
    new Reflector(),
  );
  const generateKey = (guard as unknown as { generateKey: (c: ExecutionContext, s: string, n: string) => string })
    .generateKey.bind(guard);

  it('gives AuthController.login and OidcController.link the exact same key for the same IP', () => {
    const loginKey = generateKey(
      contextFor(AuthController, AuthController.prototype.login),
      '203.0.113.1',
      'default',
    );
    const linkKey = generateKey(contextFor(OidcController, OidcController.prototype.link), '203.0.113.1', 'default');
    expect(loginKey).toBe(linkKey);
  });

  it('still keys by IP, so two different IPs never share a bucket', () => {
    const first = generateKey(
      contextFor(AuthController, AuthController.prototype.login),
      '203.0.113.1',
      'default',
    );
    const second = generateKey(contextFor(OidcController, OidcController.prototype.link), '203.0.113.2', 'default');
    expect(first).not.toBe(second);
  });

  it('leaves every other route with its own, independent key (the default behavior)', () => {
    function create() {}
    const signUp = generateKey(contextFor({ name: 'UsersController' }, create), '203.0.113.1', 'default');
    const posts = generateKey(contextFor({ name: 'PostsController' }, create), '203.0.113.1', 'default');
    const loginKey = generateKey(
      contextFor(AuthController, AuthController.prototype.login),
      '203.0.113.1',
      'default',
    );
    expect(signUp).not.toBe(posts);
    expect(signUp).not.toBe(loginKey);
    expect(posts).not.toBe(loginKey);
  });

  // A handler without @ThrottleBucket falls back to the class+method-name key
  // and never enters the shared bucket — metadata opts in, name alone does not.
  // An impostor whose class happens to be named 'AuthController' still gets its
  // own independent key, not the shared password-guess one.
  it('does not share the bucket with a handler that has no @ThrottleBucket — metadata opts in, name alone does not', () => {
    class ImpostorAuthController {
      login() {}
    }
    Object.defineProperty(ImpostorAuthController, 'name', { value: 'AuthController' });

    const impostorKey = generateKey(
      contextFor(ImpostorAuthController, ImpostorAuthController.prototype.login),
      '203.0.113.1',
      'default',
    );
    const realKey = generateKey(
      contextFor(AuthController, AuthController.prototype.login),
      '203.0.113.1',
      'default',
    );
    expect(impostorKey).not.toBe(realKey);
  });
});
/* oxlint-enable typescript/unbound-method */
