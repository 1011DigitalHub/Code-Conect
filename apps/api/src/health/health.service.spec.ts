import { Logger } from '@nestjs/common';
import type { Mock } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: Mock };
  let errorSpy: Mock;

  beforeEach(() => {
    prisma = { $queryRaw: vi.fn() };
    service = new HealthService(prisma as unknown as PrismaService);
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined) as Mock;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('is reachable when the database answers the probe', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.isDatabaseReachable()).resolves.toBe(true);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // The 503 AppController throws from this is an HttpException, so
  // AllExceptionsFilter never logs it — this is the only place the real
  // Postgres error ends up in a server-side log at all.
  it('is not reachable when the probe throws, and logs why', async () => {
    const error = new Error('connection terminated');
    prisma.$queryRaw.mockRejectedValue(error);

    await expect(service.isDatabaseReachable()).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith('database health probe failed', error.stack);
  });

  // pg's pool has no query timeout by default, so a stuck connection would
  // otherwise hang this (and the request to GET /) forever. The probe never
  // resolving, not an explicit rejection, is what proves the race — a probe
  // that rejects fast is already covered by the case above.
  it('is not reachable when the probe never settles', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}));

    const result = service.isDatabaseReachable();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
