import { act, renderHook, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { likePost, listPosts, unlikePost } from '../api/posts'
import { useFeed } from './useFeed'
import type { PostCollection } from '../api/types'

vi.mock('../api/posts', () => ({
  listPosts: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}))

const post: PostCollection['data'][number] = {
  slug: 'um-post',
  title: 'Um post',
  excerpt: 'Resumo',
  thumbnailUrl: null,
  createdAt: '2026-10-05T12:00:00.000Z',
  author: { id: 1, name: 'Ana Souza', self: '/users/1' },
  likeCount: 4,
  commentCount: 2,
  likedByMe: false,
  links: {
    self: '/posts/um-post',
    comments: '/posts/um-post/comments',
    like: '/posts/um-post/like',
    author: '/users/1',
  },
}

function collection(overrides: Partial<PostCollection> = {}): PostCollection {
  return {
    data: [post],
    pagination: { page: 1, perPage: 9, total: 1, totalPages: 1 },
    links: { self: '/posts?page=1', next: null, prev: null },
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

describe('useFeed', () => {
  beforeEach(() => {
    vi.mocked(listPosts).mockReset()
    vi.mocked(likePost).mockReset()
    vi.mocked(unlikePost).mockReset()
  })

  it('starts loading and then exposes the fetched posts', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toHaveLength(1)
    expect(result.current.pagination?.total).toBe(1)
  })

  it('passes q and page to the API, omitting an empty q', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())

    renderHook(() => useFeed({ q: '', page: 2, onUnauthorized: vi.fn() }))

    await waitFor(() =>
      expect(listPosts).toHaveBeenCalledWith(
        { q: undefined, page: 2 },
        expect.anything(),
      ),
    )
  })

  it('refetches when the query changes, and shows loading again rather than stale data', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())

    const { result, rerender } = renderHook(
      ({ q }) => useFeed({ q, page: 1, onUnauthorized: vi.fn() }),
      { initialProps: { q: '' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(listPosts).mockReturnValue(new Promise(() => {}))
    rerender({ q: 'react' })

    expect(result.current.loading).toBe(true)
  })

  it('reports a fetch failure', async () => {
    vi.mocked(listPosts).mockRejectedValue(httpError(500))

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.posts).toEqual([])
  })

  it('applies a like optimistically and keeps it on success', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())
    vi.mocked(likePost).mockResolvedValue()

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike('um-post')
    })

    // Optimistic: flips before the request resolves.
    expect(result.current.posts[0]?.likedByMe).toBe(true)
    expect(result.current.posts[0]?.likeCount).toBe(5)

    await waitFor(() => expect(result.current.pendingSlug).toBeNull())
    expect(result.current.posts[0]?.likedByMe).toBe(true)
    expect(likePost).toHaveBeenCalledWith('um-post')
  })

  it('rolls the optimistic like back on failure', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())
    vi.mocked(likePost).mockRejectedValue(httpError(500))

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike('um-post')
    })

    await waitFor(() => expect(result.current.pendingSlug).toBeNull())
    expect(result.current.posts[0]?.likedByMe).toBe(false)
    expect(result.current.posts[0]?.likeCount).toBe(4)
    expect(result.current.error).toBeTruthy()
  })

  it('signs the viewer out and explains it on a 401 while liking', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())
    vi.mocked(likePost).mockRejectedValue(httpError(401))
    const onUnauthorized = vi.fn()

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike('um-post')
    })

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
    expect(result.current.posts[0]?.likedByMe).toBe(false)
  })

  it('unlikes a post that was already liked', async () => {
    vi.mocked(listPosts).mockResolvedValue(
      collection({
        data: [{ ...post, likedByMe: true, likeCount: 5 }],
      }),
    )
    vi.mocked(unlikePost).mockResolvedValue()

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike('um-post')
    })

    expect(result.current.posts[0]?.likedByMe).toBe(false)
    expect(result.current.posts[0]?.likeCount).toBe(4)
    await waitFor(() => expect(unlikePost).toHaveBeenCalledWith('um-post'))
  })

  it('ignores a second toggle while one is already in flight', async () => {
    vi.mocked(listPosts).mockResolvedValue(collection())
    vi.mocked(likePost).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleLike('um-post')
      result.current.toggleLike('um-post')
    })

    expect(likePost).toHaveBeenCalledTimes(1)
  })

  it('aborts the fetch on unmount', () => {
    vi.mocked(listPosts).mockReturnValue(new Promise(() => {}))

    const { unmount } = renderHook(() =>
      useFeed({ q: '', page: 1, onUnauthorized: vi.fn() }),
    )
    unmount()

    const signal = vi.mocked(listPosts).mock.calls[0]?.[1]
    expect(signal?.aborted).toBe(true)
  })
})
