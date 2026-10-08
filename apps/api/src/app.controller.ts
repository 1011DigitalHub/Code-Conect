import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NoCsrf } from './auth/no-csrf.decorator.js';
import { Public } from './auth/public.decorator.js';
import { ErrorResponseDto } from './common/dto/error-response.dto.js';
import { HealthResponseDto } from './health/dto/health-response.dto.js';
import { HealthService } from './health/health.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  // Infrastructure (Docker HEALTHCHECK, uptime monitors) consumes this
  // route, not a browser. @NoCsrf() is redundant with CsrfGuard's GET
  // exemption, kept only as documentation — same precedent as GET /auth/csrf.
  //
  // @SkipThrottle() is deliberate, not an oversight: this route reads
  // nothing sensitive and changes no state, so exempting it opens no real
  // abuse surface, while leaving it under the global 100/min means a probe
  // polling aggressively (or sharing an IP with a busy reverse proxy) can
  // get a 429 and have that misread by infrastructure as "unhealthy" — the
  // health check becoming the reason the check fails.
  @Public()
  @NoCsrf()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Health check: confirma que a API e o banco de dados estão respondendo' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async getHealth(): Promise<HealthResponseDto> {
    const reachable = await this.healthService.isDatabaseReachable();
    if (!reachable) {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}
