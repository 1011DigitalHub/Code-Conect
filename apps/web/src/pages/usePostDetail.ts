import { useCallback, useEffect, useRef, useState } from 'react'
import { createComment, listComments } from '../api/comments'
import { getPost, likePost, unlikePost } from '../api/posts'
import { getErrorMessage, isNotFound, isUnauthorized } from '../api/errors'
import type { Comment, PostDetail } from '../api/types'

export type UsePostDetailParams = {
  slug: string
  onUnauthorized: () => void
}

export type PostDetailState = {
  post?: PostDetail
  comments: Comment[]
  loading: boolean
  notFound: boolean
  error?: string
  likePending: boolean
  commentPending: boolean
  commentError?: string
  toggleLike: () => void
  submitComment: (body: string) => void
}

// Keyed by slug so `loading` is derived during render and the previous post is
// never shown while a new one is being fetched.
type PostResult = {
  slug: string
  post?: PostDetail
  notFound?: boolean
  error?: string
}

type CommentsResult = {
  slug: string
  comments: Comment[]
}

// The post and its comments are fetched independently: the post is what the
// first paint waits on, and the comments can load (and later paginate) on
// their own.
export function usePostDetail({
  slug,
  onUnauthorized,
}: UsePostDetailParams): PostDetailState {
  const [result, setResult] = useState<PostResult>()
  const [commentsResult, setCommentsResult] = useState<CommentsResult>()
  const [likePending, setLikePending] = useState(false)
  const [commentPending, setCommentPending] = useState(false)
  const [commentError, setCommentError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  // Refs, not just the *Pending state: two calls in the same event (a fast
  // double click or a double submit) both run before React commits a state
  // update, so a state-only guard would let both through.
  const likePendingRef = useRef(false)
  const commentPendingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    getPost(slug, controller.signal)
      .then((post) => setResult({ slug, post }))
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return
        if (isNotFound(fetchError)) {
          setResult({ slug, notFound: true })
          return
        }
        setResult({ slug, error: getErrorMessage(fetchError) })
      })

    listComments(slug, undefined, controller.signal)
      .then((collection) => setCommentsResult({ slug, comments: collection.data }))
      .catch(() => {
        // A post that renders without its comments is still useful, and the
        // post request above already reports a genuine failure.
        if (controller.signal.aborted) return
        setCommentsResult({ slug, comments: [] })
      })

    return () => controller.abort()
  }, [slug])

  const current = result?.slug === slug ? result : undefined
  const post = current?.post
  const comments = commentsResult?.slug === slug ? commentsResult.comments : []

  const toggleLike = useCallback(() => {
    if (!post || likePendingRef.current) return
    likePendingRef.current = true

    const liked = post.likedByMe
    const apply = (value: boolean) => {
      setResult((previous) =>
        previous?.post
          ? {
              ...previous,
              post: {
                ...previous.post,
                likedByMe: value,
                likeCount: previous.post.likeCount + (value ? 1 : -1),
              },
            }
          : previous,
      )
    }

    apply(!liked)
    setLikePending(true)
    setActionError(undefined)

    const request = liked ? unlikePost(post.slug) : likePost(post.slug)
    request
      .catch((likeError: unknown) => {
        apply(liked)
        if (isUnauthorized(likeError)) {
          onUnauthorized()
          setActionError('Sua sessão expirou. Entre novamente para curtir.')
          return
        }
        setActionError(getErrorMessage(likeError))
      })
      .finally(() => {
        likePendingRef.current = false
        setLikePending(false)
      })
  }, [post, onUnauthorized])

  const submitComment = useCallback(
    (body: string) => {
      if (commentPendingRef.current) return
      commentPendingRef.current = true
      setCommentPending(true)
      setCommentError(undefined)

      createComment(slug, { body })
        .then((created) => {
          // Appended, not prepended: the API lists oldest first, so the new
          // comment belongs at the end of the thread.
          setCommentsResult((previous) =>
            previous?.slug === slug
              ? { slug, comments: [...previous.comments, created] }
              : { slug, comments: [created] },
          )
          setResult((previous) =>
            previous?.post
              ? {
                  ...previous,
                  post: {
                    ...previous.post,
                    commentCount: previous.post.commentCount + 1,
                  },
                }
              : previous,
          )
        })
        .catch((submitError: unknown) => {
          if (isUnauthorized(submitError)) {
            onUnauthorized()
            setCommentError('Sua sessão expirou. Entre novamente para comentar.')
            return
          }
          setCommentError(getErrorMessage(submitError))
        })
        .finally(() => {
          commentPendingRef.current = false
          setCommentPending(false)
        })
    },
    [slug, onUnauthorized],
  )

  return {
    post,
    comments,
    loading: current === undefined,
    notFound: current?.notFound ?? false,
    error: actionError ?? current?.error,
    likePending,
    commentPending,
    commentError,
    toggleLike,
    submitComment,
  }
}
