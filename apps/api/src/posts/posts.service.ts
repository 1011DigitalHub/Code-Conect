import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildCollectionLinks, buildPagination } from '../common/pagination.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import {
  PostCollectionDto,
  PostDetailRecord,
  PostEntity,
  PostRecord,
  PostSummaryEntity,
} from './entities/post.entity.js';
import { assertSlugFormat, uniqueSlug } from './slug.js';

const UNIQUE_VIOLATION = 'P2002';

// No serial id is ever 0, so an anonymous viewer's filtered `likes` relation
// always comes back empty — which is exactly "likedByMe: false" — without
// needing a conditional spread in the select (that would wreck Prisma's
// inferred result type).
const NO_VIEWER = 0;

function feedSelect(viewerId: number) {
  return {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    thumbnailUrl: true,
    createdAt: true,
    author: { select: { id: true, name: true } },
    _count: { select: { likes: true, comments: true } },
    likes: { where: { userId: viewerId }, select: { userId: true } },
  } satisfies Prisma.PostSelect;
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListPostsQueryDto,
    viewerId = NO_VIEWER,
  ): Promise<PostCollectionDto> {
    const { page, perPage } = query;
    const term = query.q?.trim() ?? '';

    const { rows, total } = term
      ? await this.search(term, page, perPage, viewerId)
      : await this.chronological(page, perPage, viewerId);

    const pagination = buildPagination({ page, perPage, total });
    return {
      data: rows.map((row) => new PostSummaryEntity(row)),
      pagination,
      links: buildCollectionLinks(
        '/posts',
        { q: term || undefined, perPage },
        page,
        pagination.totalPages,
      ),
    };
  }

  private async chronological(
    page: number,
    perPage: number,
    viewerId: number,
  ): Promise<{ rows: PostRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        select: feedSelect(viewerId),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.post.count(),
    ]);
    return { rows, total };
  }

  // Full-text search. The raw query is only a ranker — "which ids, in what
  // order, and how many in total" — and the typed query below hydrates them,
  // so the relation counts and likedByMe stay type-safe instead of being
  // hand-written LEFT JOIN LATERALs.
  private async search(
    term: string,
    page: number,
    perPage: number,
    viewerId: number,
  ): Promise<{ rows: PostRecord[]; total: number }> {
    // Every interpolation here is a bound parameter ($1, $2, $3) — the tagged
    // template never concatenates. 'portuguese' is a SQL literal, not user
    // input: a regconfig cannot be parameterised.
    //
    // websearch_to_tsquery (not to_tsquery) is what makes stray punctuation
    // safe: '!!!' yields an empty query that matches nothing, instead of
    // raising a syntax error that would surface as a 500.
    const ranked = await this.prisma.$queryRaw<{ id: number; total: bigint }[]>`
      WITH search AS (
        SELECT websearch_to_tsquery('portuguese', ${term}) AS query
      )
      SELECT p."id", count(*) OVER () AS total
      FROM "posts" p, search s
      WHERE p."search_vector" @@ s.query
      ORDER BY ts_rank(p."search_vector", s.query) DESC,
               p."created_at" DESC,
               p."id" DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `;

    const [firstRanked] = ranked;
    if (!firstRanked) return { rows: [], total: 0 };

    // count(*) is int8, which the driver hands back as a BigInt. It must be
    // converted here: JSON.stringify throws on a BigInt, so letting one reach
    // the controller would turn a search into a 500.
    const total = Number(firstRanked.total);
    const ids = ranked.map((row) => row.id);

    const found = await this.prisma.post.findMany({
      where: { id: { in: ids } },
      select: feedSelect(viewerId),
    });

    // `IN` does not preserve order, so restore the ranking.
    const byId = new Map(found.map((post) => [post.id, post]));
    const rows = ids
      .map((id) => byId.get(id))
      .filter((post): post is PostRecord => post !== undefined);

    return { rows, total };
  }

  async findBySlug(slug: string, viewerId = NO_VIEWER): Promise<PostEntity> {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      select: { ...feedSelect(viewerId), content: true },
    });
    if (!post) throw new NotFoundException('Post não encontrado');
    return new PostEntity(post as PostDetailRecord);
  }

  async create(dto: CreatePostDto, authorId: number): Promise<PostEntity> {
    const slug = await uniqueSlug(dto.title, async (candidate) => {
      const existing = await this.prisma.post.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });
    assertSlugFormat(slug);

    try {
      const post = await this.prisma.post.create({
        data: {
          slug,
          title: dto.title,
          excerpt: dto.excerpt,
          content: dto.content,
          thumbnailUrl: dto.thumbnailUrl ?? null,
          authorId,
        },
        select: { ...feedSelect(authorId), content: true },
      });
      return new PostEntity(post as PostDetailRecord);
    } catch (error) {
      // uniqueSlug checked first, but two concurrent creates with the same
      // title can still race; the unique index is what actually decides.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Já existe um post com esse título');
      }
      throw error;
    }
  }

  // PUT and DELETE on the like singleton: both idempotent, both 204, so a
  // double click is harmless instead of a 409.
  async like(slug: string, userId: number): Promise<void> {
    const postId = await this.requireId(slug);
    await this.prisma.like.createMany({
      data: [{ postId, userId }],
      skipDuplicates: true,
    });
  }

  async unlike(slug: string, userId: number): Promise<void> {
    const postId = await this.requireId(slug);
    await this.prisma.like.deleteMany({ where: { postId, userId } });
  }

  private async requireId(slug: string): Promise<number> {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post não encontrado');
    return post.id;
  }
}
