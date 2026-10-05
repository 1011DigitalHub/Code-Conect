import { api } from './client'
import type {
  CreatePostBody,
  ListPostsParams,
  PostCollection,
  PostDetail,
} from './types'

// Only q/page/perPage are ever sent: the API rejects any undeclared query
// parameter with a 400 (its ValidationPipe uses forbidNonWhitelisted).
export async function listPosts(
  { q, page, perPage }: ListPostsParams = {},
  signal?: AbortSignal,
): Promise<PostCollection> {
  const { data } = await api.get<PostCollection>('/posts', {
    params: { ...(q ? { q } : {}), ...(page ? { page } : {}), ...(perPage ? { perPage } : {}) },
    signal,
  })
  return data
}

export async function getPost(slug: string, signal?: AbortSignal): Promise<PostDetail> {
  const { data } = await api.get<PostDetail>(`/posts/${encodeURIComponent(slug)}`, {
    signal,
  })
  return data
}

export async function createPost(body: CreatePostBody): Promise<PostDetail> {
  const { data } = await api.post<PostDetail>('/posts', body)
  return data
}

// PUT and DELETE are both idempotent and answer 204, so a double click is a
// no-op rather than an error, and the caller can update its own count by ±1
// without refetching.
export async function likePost(slug: string): Promise<void> {
  await api.put(`/posts/${encodeURIComponent(slug)}/like`)
}

export async function unlikePost(slug: string): Promise<void> {
  await api.delete(`/posts/${encodeURIComponent(slug)}/like`)
}
