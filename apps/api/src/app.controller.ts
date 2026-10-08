import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @Public()
  @NoCsrf()
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
