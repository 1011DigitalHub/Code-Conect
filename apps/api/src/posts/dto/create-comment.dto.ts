import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/transforms.js';

export class CreateCommentDto {
  @ApiProperty({ example: 'Muito bom, obrigado por compartilhar!', minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
