import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health-indicator.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const health = { check: vi.fn() };
  const dbIndicator = { isHealthy: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: health },
        { provide: DatabaseHealthIndicator, useValue: dbIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('live', () => {
    it('returns ok without checking any dependency', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
      expect(health.check).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('delegates to HealthCheckService with the database indicator', async () => {
      const result = { status: 'ok', info: { database: { status: 'up' } }, error: {}, details: { database: { status: 'up' } } };
      health.check.mockResolvedValue(result);

      await expect(controller.ready()).resolves.toEqual(result);
      expect(health.check).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Function)]));
    });
  });
});
