import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkAccountDto {
  @ApiProperty({ example: 'senha-segura-123', description: 'Senha da conta local a ser vinculada' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
