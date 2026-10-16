import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { HealthService } from './health.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly healthService: HealthService,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult<'database'>> {
    const reachable = await this.healthService.isDatabaseReachable();
    const session = this.healthIndicatorService.check('database');
    return reachable ? session.up() : session.down('Database unreachable');
  }
}
