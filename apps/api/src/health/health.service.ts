import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // Tagged template, never string interpolation — see the raw SQL rule in
  // database-persistence.md. $connect() already happened at boot
  // (PrismaService.onModuleInit) and may be stale since then; only a
  // round-trip query proves the database is reachable right now.
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
