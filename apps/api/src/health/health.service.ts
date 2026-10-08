import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Shorter than the Docker HEALTHCHECK's own --timeout (5s): a probe that
// times out here still answers with a clean false/503, instead of Docker
// killing the whole health check process with no application-level log.
const PROBE_TIMEOUT_MS = 3_000;

// GET / is @SkipThrottle()'d (see app.controller.ts) so infrastructure
// polling it never gets misread as "unhealthy" from a 429 — but that also
// means nothing stops a flood of anonymous requests from each opening a
// connection in pg's pool, competing with the rest of the API for it. This
// window is what actually bounds that: every call within it reuses the
// settled result below instead of starting a new probe.
const PROBE_CACHE_MS = 1_500;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private pending: Promise<boolean> | null = null;
  private cached: { expiresAt: number; value: boolean } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // Coalesces concurrent callers onto the one in-flight probe, and reuses
  // its settled result for PROBE_CACHE_MS *after it settles* — so a
  // thousand requests arriving while a probe is running, or shortly after
  // one finished, cost at most one round trip to the database, not a
  // thousand.
  //
  // The window starts at settlement, not at the call that triggered the
  // probe, on purpose: starting it at the call would let a probe stuck past
  // PROBE_CACHE_MS (pool exhausted, a half-open connection) accumulate a new
  // one every window while the old one is still pending — the exact
  // connection-pool exhaustion this cache exists to prevent, just spread
  // across several stuck queries instead of one. Gating on `this.pending`
  // first means at most one probe is ever in flight, full stop, regardless
  // of how long it takes.
  isDatabaseReachable(): Promise<boolean> {
    if (this.pending) {
      return this.pending;
    }

    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return Promise.resolve(this.cached.value);
    }

    this.pending = this.probe().then((value) => {
      this.cached = { expiresAt: Date.now() + PROBE_CACHE_MS, value };
      this.pending = null;
      return value;
    });
    return this.pending;
  }

  // Tagged template, never string interpolation — see the raw SQL rule in
  // database-persistence.md. $connect() already happened at boot
  // (PrismaService.onModuleInit) and may be stale since then; only a
  // round-trip query proves the database is reachable right now.
  //
  // Raced against a timeout: pg's pool has no query timeout by default, so
  // a stuck connection (pool exhausted, host dropping packets without
  // closing the socket) would otherwise hang this forever instead of
  // answering 503 — defeating the one job a health check has.
  //
  // Never rejects: isDatabaseReachable()'s .then() above assumes this always
  // settles to a boolean, never throws.
  private async probe(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (error) {
      // The only place the real reason ever gets logged: the 503
      // AppController throws from this is an HttpException, and
      // AllExceptionsFilter deliberately never logs those (a wrong
      // password isn't a bug) — without this, a database outage left zero
      // server-side trace of why the health check failed.
      this.logger.error(
        'database health probe failed',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    } finally {
      // Otherwise, the loser of the race above (usually this timer, since
      // the query normally answers well under 3s) keeps the event loop
      // alive for the rest of its 3s regardless of who actually won.
      clearTimeout(timer);
    }
  }
}
