import { ApiProperty } from '@nestjs/swagger';
import {
  CollectionLinksDto,
  PaginationDto,
} from '../../common/dto/paginated.dto.js';
import { PostAuthorDto } from './post.entity.js';

export type CommentRecord = {
  id: number;
  body: string;
  createdAt: Date;
  post: { slug: string };
  author: { id: number; name: string };
};

export class CommentLinksDto {
  @ApiProperty({ example: '/posts/componentes-react-na-pratica/comments/1' })
  self: string;

  @ApiProperty({ example: '/posts/componentes-react-na-pratica' })
  post: string;
}

export class CommentEntity {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Muito bom, obrigado por compartilhar!' })
  body: string;

  @ApiProperty({ example: '2026-10-05T12:00:00.000Z', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: PostAuthorDto })
  author: PostAuthorDto;

  @ApiProperty({ type: CommentLinksDto })
  links: CommentLinksDto;

  constructor(comment: CommentRecord) {
    this.id = comment.id;
    this.body = comment.body;
    this.createdAt = comment.createdAt.toISOString();
    this.author = {
      id: comment.author.id,
      name: comment.author.name,
      self: `/users/${comment.author.id}`,
    };
    this.links = {
      self: `/posts/${comment.post.slug}/comments/${comment.id}`,
      post: `/posts/${comment.post.slug}`,
    };
  }
}

export class CommentCollectionDto {
  @ApiProperty({ type: [CommentEntity] })
  data: CommentEntity[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ type: CollectionLinksDto })
  links: CollectionLinksDto;
}
