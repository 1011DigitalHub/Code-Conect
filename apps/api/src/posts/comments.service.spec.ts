import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CommentsService } from './comments.service.js';
import type { PostsService } from './posts.service.js';
import type { CommentRecord } from './entities/comment.entity.js';

function record(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: 1,
    body: 'Muito bom!',
    createdAt: new Date('2026-10-05T12:00:00.000Z'),
    post: { slug: 'um-post' },
    author: { id: 3, name: 'Ana Souza' },
    ...overrides,
  };
}

function prismaMock() {
  return {
    comment: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

function postsMock() {
  return { resolvePostIdBySlug: vi.fn() };
}

type PrismaMock = ReturnType<typeof prismaMock>;
type PostsMock = ReturnType<typeof postsMock>;

function serviceWith(prisma: PrismaMock, posts: PostsMock) {
  return new CommentsService(
    prisma as unknown as PrismaService,
    posts as unknown as PostsService,
  );
}

const query = { page: 1, perPage: 9 };

describe('CommentsService.list', () => {
  it('lists the oldest comment first, so the thread reads as a conversation', async () => {
    const prisma = prismaMock();
    const posts = postsMock();
    posts.resolvePostIdBySlug.mockResolvedValue(4);
    prisma.comment.findMany.mockResolvedValue([record()]);
    prisma.comment.count.mockResolvedValue(1);

    const result = await serviceWith(prisma, posts).list('um-post', { ...query });

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: 4 },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 9,
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.links).toEqual({
      self: '/posts/um-post/comments/1',
      post: '/posts/um-post',
    });
  });

  it('counts only the comments of that post', async () => {
    const prisma = prismaMock();
    const posts = postsMock();
    posts.resolvePostIdBySlug.mockResolvedValue(4);
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.comment.count.mockResolvedValue(12);

    const result = await serviceWith(prisma, posts).list('um-post', { page: 2, perPage: 9 });

    expect(prisma.comment.count).toHaveBeenCalledWith({ where: { postId: 4 } });
    expect(result.pagination.totalPages).toBe(2);
    expect(result.links.prev).toContain('page=1');
    expect(result.links.next).toBeNull();
  });

  it('throws for an unknown post', async () => {
    const posts = postsMock();
    posts.resolvePostIdBySlug.mockRejectedValue(new NotFoundException('Post não encontrado'));

    await expect(
      serviceWith(prismaMock(), posts).list('nope', { ...query }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CommentsService.create', () => {
  it('stores the comment against the post and the author', async () => {
    const prisma = prismaMock();
    const posts = postsMock();
    posts.resolvePostIdBySlug.mockResolvedValue(4);
    prisma.comment.create.mockResolvedValue(record());

    const comment = await serviceWith(prisma, posts).create(
      'um-post',
      { body: 'Muito bom!' },
      3,
    );

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { body: 'Muito bom!', postId: 4, authorId: 3 },
      }),
    );
    expect(comment.author).toEqual({ id: 3, name: 'Ana Souza', self: '/users/3' });
    expect(comment.createdAt).toBe('2026-10-05T12:00:00.000Z');
  });

  it('throws for an unknown post', async () => {
    const posts = postsMock();
    posts.resolvePostIdBySlug.mockRejectedValue(new NotFoundException('Post não encontrado'));

    await expect(
      serviceWith(prismaMock(), posts).create('nope', { body: 'Oi' }, 3),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CommentsService.findOne', () => {
  it('scopes the lookup to the post, so a comment of another post is a 404', async () => {
    const prisma = prismaMock();
    prisma.comment.findFirst.mockResolvedValue(null);

    await expect(
      serviceWith(prisma, postsMock()).findOne('outro-post', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, post: { slug: 'outro-post' } } }),
    );
  });

  it('returns the comment', async () => {
    const prisma = prismaMock();
    prisma.comment.findFirst.mockResolvedValue(record());

    const comment = await serviceWith(prisma, postsMock()).findOne('um-post', 1);

    expect(comment.id).toBe(1);
    expect(comment.body).toBe('Muito bom!');
  });
});
