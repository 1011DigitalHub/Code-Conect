import { act, renderHook, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { createComment, listComments } from '../api/comments'
import { getPost, likePost, unlikePost } from '../api/posts'
import { usePostDetail } from './usePostDetail'
import type { Comment, PostDetail } from '../api/types'

vi.mock('../api/posts', () => ({
  getPost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}))
vi.mock('../api/comments', () => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
}))

const links = {
  self: '/posts/um-post',
  comments: '/posts/um-post/comments',
  like: '/posts/um-post/like',
  author: '/users/1',
}

function post(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    slug: 'um-post',
    title: 'Um post',
    excerpt: 'Resumo',
    content: 'Corpo',
    thumbnailUrl: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    author: { id: 1, name: 'Ana Souza', self: '/users/1' },
    likeCount: 4,
    commentCount: 0,
    likedByMe: false,
    links,
    ...overrides,
  }
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    body: 'Muito bom!',
    createdAt: '2026-10-05T12:00:00.000Z',
    author: { id: 2, name: 'Bruno Lima', self: '/users/2' },
    links: { self: '/posts/um-post/comments/1', post: '/posts/um-post' },
    ...overrides,
  }
}

function httpError(status: number): AxiosError {
  return new AxiosError('failed', 'ERR', undefined, null, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

describe('usePostDetail', () => {
  beforeEach(() => {
    vi.mocked(getPost).mockReset()
    vi.mocked(likePost).mockReset()
    vi.mocked(unlikePost).mockReset()
    vi.mocked(listComments).mockReset()
    vi.mocked(createComment).mockReset()
  })

  it('loads the post and its comments', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [comment()],
      pagination: { page: 1, perPage: 9, total: 1, totalPages: 1 },
      links: { self: '/posts/um-post/comments?page=1', next: null, prev: null },
    })

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.post?.title).toBe('Um post')
    expect(result.current.comments).toHaveLength(1)
  })

  it('reports a 404 as notFound rather than a generic error', async () => {
    vi.mocked(getPost).mockRejectedValue(httpError(404))
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'nao-existe', onUnauthorized: vi.fn() }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notFound).toBe(true)
    expect(result.current.post).toBeUndefined()
  })

  it('still renders the post when the comments request fails', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockRejectedValue(httpError(500))

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.post?.title).toBe('Um post')
    expect(result.current.comments).toEqual([])
  })

  it('toggles the like optimistically', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })
    vi.mocked(likePost).mockResolvedValue()

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike()
    })

    expect(result.current.post?.likedByMe).toBe(true)
    expect(result.current.post?.likeCount).toBe(5)
    await waitFor(() => expect(result.current.likePending).toBe(false))
  })

  it('ignores a second like toggle while one is in flight', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })
    vi.mocked(likePost).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike()
      result.current.toggleLike()
    })

    expect(likePost).toHaveBeenCalledTimes(1)
  })

  it('appends a new comment and bumps the count', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })
    vi.mocked(createComment).mockResolvedValue(comment())

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.submitComment('Muito bom!')
      await waitFor(() => expect(result.current.commentPending).toBe(false))
    })

    expect(result.current.comments).toHaveLength(1)
    expect(result.current.post?.commentCount).toBe(1)
  })

  it('reports a comment failure without losing the post', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })
    vi.mocked(createComment).mockRejectedValue(httpError(500))

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.submitComment('Muito bom!')
      await waitFor(() => expect(result.current.commentPending).toBe(false))
    })

    expect(result.current.commentError).toBeTruthy()
    expect(result.current.post).toBeDefined()
  })

  it('signs the viewer out on a 401 while commenting', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })
    vi.mocked(createComment).mockRejectedValue(httpError(401))
    const onUnauthorized = vi.fn()

    const { result } = renderHook(() =>
      usePostDetail({ slug: 'um-post', onUnauthorized }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.submitComment('Muito bom!')
      await waitFor(() => expect(result.current.commentPending).toBe(false))
    })

    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('refetches and shows loading again when the slug changes', async () => {
    vi.mocked(getPost).mockResolvedValue(post())
    vi.mocked(listComments).mockResolvedValue({
      data: [],
      pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })

    const { result, rerender } = renderHook(
      ({ slug }) => usePostDetail({ slug, onUnauthorized: vi.fn() }),
      { initialProps: { slug: 'um-post' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(getPost).mockReturnValue(new Promise(() => {}))
    rerender({ slug: 'outro-post' })

    expect(result.current.loading).toBe(true)
  })
})
