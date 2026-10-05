import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/transforms.js';

export class CreatePostDto {
  @ApiProperty({ example: 'Componentes React na prática', minLength: 3, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    example:
      'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade.',
    minLength: 50,
    maxLength: 160,
    description:
      'Resumo exibido no feed. A faixa de 50 a 160 caracteres é a mesma da meta description da página do post, que reaproveita este texto.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(160)
  excerpt: string;

  @ApiProperty({
    example: 'Parágrafos separados por uma linha em branco.',
    minLength: 20,
    maxLength: 10_000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(10_000)
  content: string;

  @ApiPropertyOptional({
    example: '/posts/componentes-react-na-pratica.webp',
    maxLength: 500,
    description:
      'URL absoluta (http/https) ou caminho a partir da raiz do site. Sem imagem, o feed mostra um placeholder.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  // @IsUrl would reject a site-relative path like /posts/x.webp, which is
  // exactly what the seeded thumbnails use.
  @Matches(/^(https?:\/\/|\/)/, {
    message: 'thumbnailUrl must be an http(s) URL or start with /',
  })
  thumbnailUrl?: string;
}
