import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildCollectionLinks, buildPagination } from '../common/pagination.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import {
  CommentCollectionDto,
  CommentEntity,
  CommentRecord,
} from './entities/comment.entity.js';
import { PostsService } from './posts.service.js';

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  post: { select: { slug: true } },
  author: { select: { id: true, name: true } },
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  async list(
    slug: string,
    query: PaginationQueryDto,
  ): Promise<CommentCollectionDto> {
    const postId = await this.postsService.resolvePostBySlug(slug);
    const { page, perPage } = query;

    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId },
        select: commentSelect,
        // Oldest first: a comment thread reads as a conversation.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.comment.count({ where: { postId } }),
    ]);

    const pagination = buildPagination({ page, perPage, total });
    return {
      data: rows.map((row) => new CommentEntity(row)),
      pagination,
      links: buildCollectionLinks(
        `/posts/${slug}/comments`,
        { perPage },
        page,
        pagination.totalPages,
      ),
    };
  }

  async findOne(slug: string, commentId: number): Promise<CommentEntity> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, post: { slug } },
      select: commentSelect,
    });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    return new CommentEntity(comment);
  }

  async create(
    slug: string,
    dto: CreateCommentDto,
    authorId: number,
  ): Promise<CommentEntity> {
    const postId = await this.postsService.resolvePostBySlug(slug);
    const comment: CommentRecord = await this.prisma.comment.create({
      data: { body: dto.body, postId, authorId },
      select: commentSelect,
    });
    return new CommentEntity(comment);
  }
}
