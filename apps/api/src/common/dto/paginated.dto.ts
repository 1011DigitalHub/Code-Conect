import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 9 })
  perPage: number;

  @ApiProperty({ example: 42, description: 'Total de itens que casam com o filtro' })
  total: number;

  @ApiProperty({ example: 5, minimum: 1 })
  totalPages: number;
}

export class CollectionLinksDto {
  @ApiProperty({ example: '/posts?page=1&perPage=9' })
  self: string;

  @ApiProperty({
    example: '/posts?page=2&perPage=9',
    nullable: true,
    type: String,
    description: 'null na última página',
  })
  next: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: 'null na primeira página',
  })
  prev: string | null;
}
