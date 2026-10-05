import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { CsrfGuard } from './csrf.guard.js';
import { mintCsrfToken, sessionKey } from './csrf.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { NO_CSRF_KEY } from './no-csrf.decorator.js';

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (() => undefined) as unknown as () => void,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  function build() {
    const reflector = new Reflector();
    const metadata = new Map<string, boolean>();
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
      (key: string) => metadata.get(key) ?? false,
    );
    return { guard: new CsrfGuard(reflector), metadata };
  }

  it('lets safe methods through unconditionally', () => {
    const { guard } = build();
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(guard.canActivate(contextFor({ method, headers: {} }))).toBe(true);
    }
  });

  it('lets a @NoCsrf() route through with no token at all', () => {
    const { guard, metadata } = build();
    metadata.set(NO_CSRF_KEY, true);
    expect(guard.canActivate(contextFor({ method: 'POST', headers: {} }))).toBe(true);
  });

  it('lets a @Public() route through for now (bridge phase)', () => {
    const { guard, metadata } = build();
    metadata.set(IS_PUBLIC_KEY, true);
    expect(guard.canActivate(contextFor({ method: 'POST', headers: {} }))).toBe(true);
  });

  it('rejects a protected unsafe request with no csrf cookie or header', () => {
    const { guard } = build();
    expect(() =>
      guard.canActivate(contextFor({ method: 'POST', headers: {} })),
    ).toThrow(ForbiddenException);
  });

  it('rejects when the header is missing even if the cookie is valid', () => {
    const { guard } = build();
    const key = sessionKey('token-x');
    const token = mintCsrfToken(key);
    const request = {
      method: 'POST',
      headers: { cookie: `access_token=token-x; csrf_token=${token}` },
    };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('rejects when the header does not match the cookie', () => {
    const { guard } = build();
    const key = sessionKey('token-x');
    const token = mintCsrfToken(key);
    const request = {
      method: 'POST',
      headers: {
        cookie: `access_token=token-x; csrf_token=${token}`,
        'x-csrf-token': 'something-else',
      },
    };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('rejects a token minted for a different session', () => {
    const { guard } = build();
    // Token was minted before this session existed (e.g. anonymous bootstrap).
    const staleToken = mintCsrfToken(sessionKey(undefined));
    const request = {
      method: 'POST',
      headers: {
        cookie: `access_token=token-x; csrf_token=${staleToken}`,
        'x-csrf-token': staleToken,
      },
    };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('accepts a matching, session-bound pair', () => {
    const { guard } = build();
    const key = sessionKey('token-x');
    const token = mintCsrfToken(key);
    const request = {
      method: 'POST',
      headers: {
        cookie: `access_token=token-x; csrf_token=${token}`,
        'x-csrf-token': token,
      },
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });
});
