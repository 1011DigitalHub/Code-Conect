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
});
