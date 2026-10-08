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

  // GET / is @SkipThrottle()'d, so nothing else stops a flood of anonymous
  // requests from each opening a connection in pg's pool. This is what
  // actually bounds that: concurrent callers share the one in-flight probe
  // instead of each starting their own.
  it('coalesces concurrent callers into a single probe', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const [first, second] = await Promise.all([
      service.isDatabaseReachable(),
      service.isDatabaseReachable(),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('probes again once the cache window has passed', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await service.isDatabaseReachable();
    await vi.advanceTimersByTimeAsync(1_501);
    await service.isDatabaseReachable();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // The bug this guards against: starting the cache window when the probe
  // *begins* (rather than when it settles) would let a caller arriving past
  // 1.5s start a second real probe while the first is still stuck — and
  // with GET / unthrottled, a continuously stuck database would accumulate
  // one more pending query every 1.5s, the exact pool exhaustion the cache
  // exists to prevent. Gating on the in-flight promise first, regardless of
  // elapsed time, is what keeps this at exactly one probe no matter how
  // long it's stuck.
  it('does not start a second probe while the first is still stuck past the cache window', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}));

    const first = service.isDatabaseReachable();
    await vi.advanceTimersByTimeAsync(1_600); // past PROBE_CACHE_MS, probe still stuck
    const second = service.isDatabaseReachable();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_400); // total 3000ms: the probe's own timeout fires
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
  });

  // The bug the 8th review round found: Promise.race protects the caller
  // (stops waiting after 3s) but never cancels the loser — the real
  // $queryRaw call keeps running and holding its pool connection, with
  // nothing tracking it once this probe() call gives up and reports false.
  // The test above only proves the cache's own 1.5s window; this one proves
  // the gap one level up — across *successive* probe cycles (timeout +
  // cache, repeating roughly every 4.5s) while the underlying query never
  // settles at all.
  it('does not start a second real query across repeated cycles while the first never settles', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}));

    const first = service.isDatabaseReachable();
    await vi.advanceTimersByTimeAsync(3_000); // this probe()'s own timeout fires
    await expect(first).resolves.toBe(false);

    await vi.advanceTimersByTimeAsync(1_600); // past the 1.5s cache window too

    const second = service.isDatabaseReachable(); // a brand-new probe() cycle
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // still just the original, still-stuck query

    await vi.advanceTimersByTimeAsync(3_000); // let this cycle's own timeout settle too
    await expect(second).resolves.toBe(false);
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

  // The timeout race leaves a dangling setTimeout behind if the query wins
  // (the common case — it normally answers in milliseconds, long before
  // the 3s timer). Left uncleared, that timer keeps firing and holding the
  // event loop open for the rest of its 3s on every single health check.
  it('clears the timeout timer once the probe settles', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await service.isDatabaseReachable();

    expect(vi.getTimerCount()).toBe(0);
  });
});
