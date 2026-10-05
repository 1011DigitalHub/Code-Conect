import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim, trimLower } from '../../common/transforms.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Maria Silva', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  @Transform(trimLower)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha-segura-123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
