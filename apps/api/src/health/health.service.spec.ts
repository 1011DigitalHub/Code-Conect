import type { Mock } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: Mock };

  beforeEach(() => {
    prisma = { $queryRaw: vi.fn() };
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it('is reachable when the database answers the probe', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(service.isDatabaseReachable()).resolves.toBe(true);
  });

  it('is not reachable when the probe throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection terminated'));
    await expect(service.isDatabaseReachable()).resolves.toBe(false);
  });
});
