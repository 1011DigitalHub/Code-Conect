import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    example: 'ok',
    description: 'Sempre "ok": um 503 (banco inacessível) já responde com ErrorResponseDto, não este corpo.',
  })
  status: 'ok';
}
