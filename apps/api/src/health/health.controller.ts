import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NoCsrf } from '../auth/no-csrf.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { HealthResponseDto } from './dto/health-response.dto.js';
import { ReadinessResponseDto } from './dto/readiness-response.dto.js';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

@ApiTags('health')
@Controller('health')
@Public()
@NoCsrf()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: confirma que o processo está respondendo' })
  @ApiOkResponse({ type: HealthResponseDto })
  live(): HealthResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness: confirma que a API e o banco de dados estão prontos' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: ReadinessResponseDto })
  ready() {
    return this.health.check([() => this.dbIndicator.isHealthy()]);
  }
}
