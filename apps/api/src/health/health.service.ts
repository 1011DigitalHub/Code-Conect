import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Shorter than the Docker HEALTHCHECK's own --timeout (5s): a probe that
// times out here still answers with a clean false/503, instead of Docker
// killing the whole health check process with no application-level log.
const PROBE_TIMEOUT_MS = 3_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Tagged template, never string interpolation — see the raw SQL rule in
  // database-persistence.md. $connect() already happened at boot
  // (PrismaService.onModuleInit) and may be stale since then; only a
  // round-trip query proves the database is reachable right now.
  //
  // Raced against a timeout: pg's pool has no query timeout by default, so
  // a stuck connection (pool exhausted, host dropping packets without
  // closing the socket) would otherwise hang this forever instead of
  // answering 503 — defeating the one job a health check has.
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, this.timeout()]);
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
    }
  }

  private timeout(): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
    });
  }
}
