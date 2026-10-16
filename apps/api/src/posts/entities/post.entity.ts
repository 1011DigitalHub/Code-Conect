import { ApiProperty } from '@nestjs/swagger';
import {
  CollectionLinksDto,
  PaginationDto,
} from '../../common/dto/paginated.dto.js';

// The shape PostsService selects for the feed. Declared here so the entity
// and the service agree on one projection.
export type PostRecord = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  author: { id: number; name: string };
  _count: { likes: number; comments: number };
  // Filtered to the current viewer by the query, so a non-empty array means
  // "this viewer liked it". Anonymous viewers always get an empty array.
  likes: { userId: number }[];
};

export type PostDetailRecord = PostRecord & { content: string };

export class PostAuthorDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: '/users/3' })
  self: string;
}

export class PostLinksDto {
  @ApiProperty({ example: '/posts/componentes-react-na-pratica' })
  self: string;

  @ApiProperty({ example: '/posts/componentes-react-na-pratica/comments' })
  comments: string;

  @ApiProperty({ example: '/posts/componentes-react-na-pratica/like' })
  like: string;

  @ApiProperty({ example: '/users/3' })
  author: string;
}

// Feed representation. Deliberately without `content`: shipping the full body
// of nine posts would bloat the payload the feed's first paint waits on.
export class PostSummaryEntity {
  @ApiProperty({ example: 'componentes-react-na-pratica' })
  slug: string;

  @ApiProperty({ example: 'Componentes React na prática' })
  title: string;

  @ApiProperty({ example: 'Como quebrar uma tela grande em componentes pequenos.' })
  excerpt: string;

  @ApiProperty({
    example: '/posts/componentes-react-na-pratica.webp',
    nullable: true,
    type: String,
    description: 'null quando o post não tem capa; o front mostra um placeholder.',
  })
  thumbnailUrl: string | null;

  @ApiProperty({ example: '2026-10-05T12:00:00.000Z', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: PostAuthorDto })
  author: PostAuthorDto;

  @ApiProperty({ example: 4 })
  likeCount: number;

  @ApiProperty({ example: 2 })
  commentCount: number;

  @ApiProperty({
    example: false,
    description:
      'Se quem está pedindo já curtiu. Sempre false para visitante não autenticado.',
  })
  likedByMe: boolean;

  @ApiProperty({ type: PostLinksDto })
  links: PostLinksDto;

  constructor(post: PostRecord) {
    this.slug = post.slug;
    this.title = post.title;
    this.excerpt = post.excerpt;
    this.thumbnailUrl = post.thumbnailUrl;
    this.createdAt = post.createdAt.toISOString();
    this.author = {
      id: post.author.id,
      name: post.author.name,
      self: `/users/${post.author.id}`,
    };
    this.likeCount = post._count.likes;
    this.commentCount = post._count.comments;
    this.likedByMe = post.likes.length > 0;
    this.links = {
      self: `/posts/${post.slug}`,
      comments: `/posts/${post.slug}/comments`,
      like: `/posts/${post.slug}/like`,
      author: `/users/${post.author.id}`,
    };
  }
}

// Single-post representation: everything the summary has, plus the body.
export class PostEntity extends PostSummaryEntity {
  @ApiProperty({ example: 'Parágrafos separados por uma linha em branco.' })
  content: string;

  constructor(post: PostDetailRecord) {
    super(post);
    this.content = post.content;
  }
}

export class PostCollectionDto {
  @ApiProperty({ type: [PostSummaryEntity] })
  data: PostSummaryEntity[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ type: CollectionLinksDto })
  links: CollectionLinksDto;
}
