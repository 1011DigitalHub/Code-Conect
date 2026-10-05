import { ApiProperty } from '@nestjs/swagger';

// The session itself travels only in the httpOnly access_token cookie set
// on this same response (see AuthController.login) — never in the body.
export class LoginResponseDto {
  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 3600, description: 'Validade da sessão em segundos' })
  expiresIn: number;
}
