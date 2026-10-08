import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../users/entities/user.entity.js';

export class SessionResponseDto {
  @ApiProperty({
    type: UserEntity,
    nullable: true,
    description: 'O usuário da sessão atual, ou null para um visitante anônimo.',
  })
  user: UserEntity | null;
}
