import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha-segura-123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
