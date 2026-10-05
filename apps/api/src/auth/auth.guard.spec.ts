import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getJwtSecret } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: getJwtSecret() });
  const guard = new AuthGuard(jwtService);

  it('rejects a request without Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a scheme other than Bearer', async () => {
    const request = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', async () => {
    const request = { headers: { authorization: 'Bearer not-a-jwt' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a valid token and fills request.user', async () => {
    const token = await jwtService.signAsync({ sub: 1, email: 'a@b.com' });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1, email: 'a@b.com' });
  });

  it('rejects a token signed with a different algorithm', async () => {
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
    const otherService = new JwtService({ secret: 'a-completely-different-secret' });
    const token = await otherService.signAsync({ sub: 1, email: 'a@b.com' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
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
