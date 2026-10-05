import { api } from './client'
import type { Comment, CommentCollection, CreateCommentBody } from './types'

export async function listComments(
  slug: string,
  page?: number,
  signal?: AbortSignal,
): Promise<CommentCollection> {
  const { data } = await api.get<CommentCollection>(
    `/posts/${encodeURIComponent(slug)}/comments`,
    { params: page ? { page } : undefined, signal },
  )
  return data
}

export async function createComment(
  slug: string,
  body: CreateCommentBody,
): Promise<Comment> {
  const { data } = await api.post<Comment>(
    `/posts/${encodeURIComponent(slug)}/comments`,
    body,
  )
  return data
}
