import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({
    description: 'JWT para o header Authorization: Bearer <token>',
  })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 3600, description: 'Validade do token em segundos' })
  expiresIn: number;
}
