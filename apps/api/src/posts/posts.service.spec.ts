import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PostsService } from './posts.service.js';
import type { PostRecord } from './entities/post.entity.js';

// uniqueSlug() always returns a safe slug in practice (see slug.spec.ts) — the
// only way to exercise the assertSlugFormat() regression guard in
// posts.service.ts is to simulate a future bug in uniqueSlug() itself, which
// needs mocking the module rather than constructor injection. The mock wraps
// the real implementation by default (every other test in this file keeps
// getting a real, correctly-derived slug) and only the one test below
// overrides it, with mockResolvedValueOnce so the override can't leak.
vi.mock('./slug.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./slug.js')>();
  return { ...actual, uniqueSlug: vi.fn(actual.uniqueSlug) };
});
const { uniqueSlug } = await import('./slug.js');

function record(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 1,
    slug: 'um-post',
    title: 'Um post',
    excerpt: 'x'.repeat(60),
    thumbnailUrl: null,
    createdAt: new Date('2026-10-05T12:00:00.000Z'),
    author: { id: 3, name: 'Ana Souza' },
    _count: { likes: 0, comments: 0 },
    likes: [],
    ...overrides,
  };
}

function prismaMock() {
  return {
    post: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    like: { createMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function serviceWith(prisma: PrismaMock) {
  return new PostsService(prisma as unknown as PrismaService);
}

const query = { page: 1, perPage: 9 };

describe('PostsService.list', () => {
  it('returns the chronological feed when there is no search term', async () => {
    const prisma = prismaMock();
    prisma.post.findMany.mockResolvedValue([record()]);
    prisma.post.count.mockResolvedValue(1);

    const result = await serviceWith(prisma).list({ ...query });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 9,
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 1, perPage: 9, total: 1, totalPages: 1 });
  });

  it('treats a whitespace-only term as no term at all', async () => {
    const prisma = prismaMock();
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.count.mockResolvedValue(0);

    await serviceWith(prisma).list({ ...query, q: '   ' });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalled();
  });

  it('paginates with skip and take', async () => {
    const prisma = prismaMock();
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.count.mockResolvedValue(30);

    const result = await serviceWith(prisma).list({ page: 3, perPage: 9 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 18, take: 9 }),
    );
    expect(result.pagination.totalPages).toBe(4);
    expect(result.links.prev).toContain('page=2');
    expect(result.links.next).toContain('page=4');
  });

  it('searches, converts the bigint total and keeps the ranking order', async () => {
    const prisma = prismaMock();
    // Ranked by relevance: 5 then 2. count(*) OVER () comes back as a BigInt.
    prisma.$queryRaw.mockResolvedValue([
      { id: 5, total: 2n },
      { id: 2, total: 2n },
    ]);
    // `IN` does not preserve order, so the hydrate deliberately returns the
    // rows the other way round.
    prisma.post.findMany.mockResolvedValue([
      record({ id: 2, slug: 'segundo' }),
      record({ id: 5, slug: 'primeiro' }),
    ]);

    const result = await serviceWith(prisma).list({ ...query, q: 'react' });

    expect(prisma.post.count).not.toHaveBeenCalled();
    expect(result.pagination.total).toBe(2);
    expect(typeof result.pagination.total).toBe('number');
    expect(result.data.map((post) => post.slug)).toEqual(['primeiro', 'segundo']);
  });

  it('keeps the search term on the collection links', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([{ id: 1, total: 20n }]);
    prisma.post.findMany.mockResolvedValue([record()]);

    const result = await serviceWith(prisma).list({ ...query, q: 'react hooks' });

    expect(result.links.self).toContain('q=react+hooks');
    expect(result.links.next).toContain('q=react+hooks');
  });

  it('returns an empty page when the search matches nothing', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await serviceWith(prisma).list({ ...query, q: '!!!' });

    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, perPage: 9, total: 0, totalPages: 1 });
  });

  it('reports likedByMe from the viewer-filtered relation', async () => {
    const prisma = prismaMock();
    prisma.post.findMany.mockResolvedValue([
      record({ likes: [{ userId: 7 }], _count: { likes: 1, comments: 0 } }),
    ]);
    prisma.post.count.mockResolvedValue(1);

    const result = await serviceWith(prisma).list({ ...query }, 7);

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          likes: { where: { userId: 7 }, select: { userId: true } },
        }),
      }),
    );
    expect(result.data[0]?.likedByMe).toBe(true);
    expect(result.data[0]?.likeCount).toBe(1);
  });

  it('reports likedByMe false for an anonymous viewer', async () => {
    const prisma = prismaMock();
    prisma.post.findMany.mockResolvedValue([record()]);
    prisma.post.count.mockResolvedValue(1);

    const result = await serviceWith(prisma).list({ ...query });

    // Viewer id 0 can never match a serial id, so the relation is empty.
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          likes: { where: { userId: 0 }, select: { userId: true } },
        }),
      }),
    );
    expect(result.data[0]?.likedByMe).toBe(false);
  });
});

describe('PostsService.findBySlug', () => {
  it('throws when the slug does not exist', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(serviceWith(prisma).findBySlug('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('includes the content and the hypermedia links', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue({ ...record(), content: 'Corpo' });

    const post = await serviceWith(prisma).findBySlug('um-post');

    expect(post.content).toBe('Corpo');
    expect(post.links).toEqual({
      self: '/posts/um-post',
      comments: '/posts/um-post/comments',
      like: '/posts/um-post/like',
      author: '/users/3',
    });
  });
});

describe('PostsService.create', () => {
  const dto = { title: 'Um post', excerpt: 'x'.repeat(60), content: 'Corpo do post' };

  it('derives a unique slug from the title', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique
      .mockResolvedValueOnce({ id: 9 }) // "ola-mundo" is taken
      .mockResolvedValueOnce(null); // "ola-mundo-2" is free
    prisma.post.create.mockResolvedValue({ ...record(), content: 'Corpo' });

    await serviceWith(prisma).create({ ...dto, title: 'Olá, Mundo!' }, 3);

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'ola-mundo-2', authorId: 3 }),
      }),
    );
  });

  it('stores a missing thumbnail as null', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue(null);
    prisma.post.create.mockResolvedValue({ ...record(), content: 'Corpo' });

    await serviceWith(prisma).create(dto, 3);

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ thumbnailUrl: null }),
      }),
    );
  });

  it('maps a unique violation to a conflict', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue(null);
    prisma.post.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );

    await expect(serviceWith(prisma).create(dto, 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects before persisting if uniqueSlug ever returns an unsafe slug', async () => {
    const prisma = prismaMock();
    vi.mocked(uniqueSlug).mockResolvedValueOnce('Bad Slug!');

    await expect(serviceWith(prisma).create(dto, 3)).rejects.toThrow(
      /does not match the safe slug format/,
    );
    expect(prisma.post.create).not.toHaveBeenCalled();
  });
});

describe('PostsService likes', () => {
  it('is idempotent when liking twice', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue({ id: 1 });
    const service = serviceWith(prisma);

    await service.like('um-post', 7);
    await service.like('um-post', 7);

    // skipDuplicates is what makes the second PUT a no-op instead of a 409.
    expect(prisma.like.createMany).toHaveBeenCalledWith({
      data: [{ postId: 1, userId: 7 }],
      skipDuplicates: true,
    });
    expect(prisma.like.createMany).toHaveBeenCalledTimes(2);
  });

  it('does not throw when unliking something that was never liked', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue({ id: 1 });
    prisma.like.deleteMany.mockResolvedValue({ count: 0 });

    await expect(serviceWith(prisma).unlike('um-post', 7)).resolves.toBeUndefined();
  });

  it('throws for an unknown slug', async () => {
    const prisma = prismaMock();
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(serviceWith(prisma).like('nope', 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(serviceWith(prisma).unlike('nope', 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
