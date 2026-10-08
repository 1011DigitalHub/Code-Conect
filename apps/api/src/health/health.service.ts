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

// A unique rejection reason for the timeout branch of the race in probe(),
// distinct from whatever the real query eventually rejects with — so the
// catch there can tell "we gave up waiting" apart from "the query actually
// failed" without string-matching an error message.
const PROBE_TIMED_OUT = Symbol('probe-timed-out');

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private pending: Promise<boolean> | null = null;
  private cached: { expiresAt: number; value: boolean } | null = null;
  // The real $queryRaw call, tracked separately from `pending`. Prisma has
  // no cancellation for it: giving up on waiting (the timeout in probe()
  // below) does not stop it running, and it keeps holding a pg pool
  // connection until it actually settles — possibly long after a 3s
  // timeout decided to answer the caller `false`. Reusing this reference
  // across probe() calls is what stops a stuck query from being joined by
  // another one every time the cache window expires.
  private inFlightQuery: Promise<unknown> | null = null;

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

    this.pending = this.probe()
      // probe() is documented to never reject, but if it somehow still did
      // (a synchronous throw building the query, before its own try even
      // runs, is the one realistic way), a .then() with no reject handler
      // would propagate that rejection and skip the reset below — `pending`
      // would stay pointed at a permanently rejected promise forever, and
      // every future call would just re-reject it instead of retrying. GET
      // / stuck answering 500 until the process restarts, the one failure
      // mode this service exists to avoid. This normalizes any such
      // rejection to `false` *before* .then(), so the reset always runs.
      .catch((error: unknown) => {
        this.logger.error(
          'database health probe rejected unexpectedly',
          error instanceof Error ? error.stack : String(error),
        );
        return false;
      })
      .then((value) => {
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
  // Never rejects: isDatabaseReachable()'s .then() above assumes this always
  // settles to a boolean, never throws.
  private async probe(): Promise<boolean> {
    // Reuses a still-running query from a previous probe() call instead of
    // starting a new one. Without this, every cycle where the cache expires
    // while the database is still stuck issues another real $queryRaw —
    // each one permanently holding its own pool connection, since nothing
    // ever cancels the ones Promise.race below already gave up waiting on.
    if (!this.inFlightQuery) {
      const query = this.prisma.$queryRaw`SELECT 1`;
      this.inFlightQuery = query;
      // Attached once, here, rather than relying on the race below: a
      // timeout can give up on `query` long before it actually settles, so
      // this is the only place guaranteed to see its real outcome whenever
      // that eventually happens — the only place the real reason ever gets
      // logged. The 503 AppController throws is an HttpException, and
      // AllExceptionsFilter deliberately never logs those (a wrong password
      // isn't a bug); without this, a database outage left zero server-side
      // trace of why the health check failed.
      query
        .catch((error: unknown) => {
          this.logger.error(
            'database health probe failed',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          if (this.inFlightQuery === query) {
            this.inFlightQuery = null;
          }
        });
    }
    const query = this.inFlightQuery;

    // Raced against a timeout: pg's pool has no query timeout by default,
    // so a stuck connection (pool exhausted, host dropping packets without
    // closing the socket) would otherwise hang this forever instead of
    // answering 503 — defeating the one job a health check has. This bounds
    // how long a *caller* waits; it does not cancel `query` itself, which
    // is exactly why `inFlightQuery` above exists.
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        query,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(PROBE_TIMED_OUT), PROBE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (error) {
      if (error === PROBE_TIMED_OUT) {
        // The real cause isn't known yet — `query` hasn't settled — so
        // there's nothing to log beyond the fact that we stopped waiting.
        // The .catch() above logs the real reason once `query` actually
        // settles, however much later that turns out to be.
        this.logger.error(
          `database health probe gave up waiting after ${PROBE_TIMEOUT_MS}ms; the underlying query is still running`,
        );
      }
      // A non-timeout rejection here is `query` itself, already logged by
      // the .catch() attached when it was created.
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
