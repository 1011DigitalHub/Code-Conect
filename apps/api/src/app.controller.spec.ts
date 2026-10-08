import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { HealthService } from './health/health.service.js';

describe('AppController', () => {
  let appController: AppController;
  const healthService = { isDatabaseReachable: vi.fn() };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('returns ok when the database answers', async () => {
      healthService.isDatabaseReachable.mockResolvedValue(true);
      await expect(appController.getHealth()).resolves.toEqual({ status: 'ok' });
    });

    it('throws a 503 when the database does not answer', async () => {
      healthService.isDatabaseReachable.mockResolvedValue(false);
      await expect(appController.getHealth()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
