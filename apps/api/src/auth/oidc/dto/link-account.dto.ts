import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LinkAccountDto {
  @ApiProperty({
    example: 'senha-segura-123',
    description: 'Senha da conta local a ser vinculada',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  // Same bounds as CreateUserDto.password: every real password this could
  // ever match was already created within them, and without a ceiling this
  // public, rate-limited-but-still-unauthenticated endpoint would run
  // scrypt (CURRENT_PARAMS, see users/password.ts) over an attacker-chosen
  // input of unbounded size.
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
