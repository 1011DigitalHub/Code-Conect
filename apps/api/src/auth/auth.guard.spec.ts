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
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );
  });

  it('rejects a request without Authorization header', async () => {
    mockPublic(false);
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a scheme other than Bearer', async () => {
    mockPublic(false);
    const request = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', async () => {
    mockPublic(false);
    const request = { headers: { authorization: 'Bearer not-a-jwt' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a valid token and fills request.user', async () => {
    mockPublic(false);
    const token = await jwtService.signAsync({ sub: 1, email: 'a@b.com' });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1, email: 'a@b.com' });
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

  it('prefers the cookie over the Authorization header when both are present', async () => {
    mockPublic(false);
    const cookieToken = await jwtService.signAsync({ sub: 1, email: 'cookie@b.com' });
    const headerToken = await jwtService.signAsync({ sub: 2, email: 'header@b.com' });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${headerToken}`, cookie: `access_token=${cookieToken}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1, email: 'cookie@b.com' });
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
    const request = { headers: { authorization: `Bearer ${header}.${payload}.` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', async () => {
    mockPublic(false);
    const otherService = new JwtService({ secret: 'a-completely-different-secret' });
    const token = await otherService.signAsync({ sub: 1, email: 'a@b.com' });
    const request = { headers: { authorization: `Bearer ${token}` } };
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
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
