import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health-indicator.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [TerminusModule.forRoot()],
  controllers: [HealthController],
  providers: [HealthService, DatabaseHealthIndicator],
  exports: [HealthService],
})
export class HealthModule {}
