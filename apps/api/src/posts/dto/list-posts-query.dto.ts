import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { trim } from '../../common/transforms.js';

export class ListPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'react hooks',
    maxLength: 120,
    description:
      'Busca full-text em título, resumo e conteúdo (configuração "portuguese", com stemming). Vazio ou só espaços devolve o feed cronológico.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  // Deliberately no @MinLength: an empty string must reach the service, which
  // treats it the same as an absent q.
  @MaxLength(120)
  q?: string;
}
