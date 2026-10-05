import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getJwtSecret } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (() => undefined) as unknown as () => void,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: getJwtSecret() });
  let reflector: Reflector;
  let guard: AuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AuthGuard(jwtService, reflector);
  });

  function mockPublic(isPublic: boolean) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  }

  it('lets a @Public() route through with no token at all', async () => {
    mockPublic(true);
    const request = { headers: {} } as { headers: object; user?: unknown };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  // A @Public() route is optionally authenticated: the public feed needs to
  // know whether the current viewer already liked each post.
  it('populates request.user on a @Public() route when the session cookie is valid', async () => {
    mockPublic(true);
    const token = await jwtService.signAsync({ sub: 7, email: 'ana@exemplo.com' });
    const request = {
      headers: { cookie: `access_token=${token}` },
    } as { headers: object; user?: { sub: number; email: string } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 7, email: 'ana@exemplo.com' });
  });

  it('lets a @Public() route through with an expired cookie and leaves request.user unset', async () => {
    mockPublic(true);
    const token = await jwtService.signAsync(
      { sub: 7, email: 'ana@exemplo.com' },
      { expiresIn: '-1s' },
    );
    const request = {
      headers: { cookie: `access_token=${token}` },
    } as { headers: object; user?: unknown };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('lets a @Public() route through with a malformed cookie and leaves request.user unset', async () => {
    mockPublic(true);
    const request = {
      headers: { cookie: 'access_token=not-a-jwt' },
    } as { headers: object; user?: unknown };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('rejects a request with no access_token cookie at all', async () => {
    mockPublic(false);
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an Authorization: Bearer header — the bridge was removed, it is no longer read', async () => {
    mockPublic(false);
    const token = await jwtService.signAsync({ sub: 1, email: 'a@b.com' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', async () => {
    mockPublic(false);
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { access_token: 'not-a-jwt' },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a token from the access_token cookie (pre-parsed req.cookies)', async () => {
    mockPublic(false);
    const token = await jwtService.signAsync({ sub: 1, email: 'a@b.com' });
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { access_token: token },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1, email: 'a@b.com' });
  });

  it('accepts a token from the raw Cookie header when nothing pre-parsed it', async () => {
    mockPublic(false);
    const token = await jwtService.signAsync({ sub: 1, email: 'a@b.com' });
    const request: Record<string, unknown> = {
      headers: { cookie: `access_token=${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1, email: 'a@b.com' });
  });

  it('rejects a token signed with a different algorithm', async () => {
    mockPublic(false);
    // alg: none, unsigned — the classic JWT bypass. base64url(header).base64url(payload).
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(JSON.stringify({ sub: 1, email: 'a@b.com' })).toString(
      'base64url',
    );
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { access_token: `${header}.${payload}.` },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', async () => {
    mockPublic(false);
    const otherService = new JwtService({ secret: 'a-completely-different-secret' });
    const token = await otherService.signAsync({ sub: 1, email: 'a@b.com' });
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { access_token: token },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    mockPublic(false);
    const token = await jwtService.signAsync(
      { sub: 1, email: 'a@b.com' },
      { expiresIn: '-1s' },
    );
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { access_token: token },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
