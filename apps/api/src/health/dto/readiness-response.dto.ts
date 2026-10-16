import { ApiProperty } from '@nestjs/swagger';

class HealthIndicatorStatusDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  status: 'up' | 'down';
}

// Terminus uses [key: string] for indicator names; "database" is the only
// key this endpoint checks, so this class names it concretely for Swagger.
class HealthInfoDto {
  @ApiProperty({ type: HealthIndicatorStatusDto })
  database: HealthIndicatorStatusDto;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok', 'error', 'shutting_down'] })
  status: 'ok' | 'error' | 'shutting_down';

  @ApiProperty({ type: HealthInfoDto })
  info: HealthInfoDto;

  @ApiProperty({ type: HealthInfoDto })
  error: HealthInfoDto;

  @ApiProperty({ type: HealthInfoDto })
  details: HealthInfoDto;
}
