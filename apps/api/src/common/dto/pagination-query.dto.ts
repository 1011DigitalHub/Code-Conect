import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 9;
export const MAX_PER_PAGE = 50;

// Query parameters arrive as strings, so @Type(() => Number) runs before the
// @IsInt() check — the global ValidationPipe has transform: true.
//
// Note that `whitelist` + `forbidNonWhitelisted` means any query parameter
// not declared on a DTO that extends this one is a 400, including tracking
// parameters like ?utm_source. That is deliberate and covered by an e2e test.
export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    example: 9,
    minimum: 1,
    maximum: MAX_PER_PAGE,
    default: DEFAULT_PER_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage: number = DEFAULT_PER_PAGE;
}
