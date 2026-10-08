import { useCallback, useEffect, useRef, useState } from 'react'
import { likePost, listPosts, unlikePost } from '../api/posts'
import { getErrorMessage, isUnauthorized } from '../api/errors'
import type { FeedPost, PostCollection } from '../api/types'

export type UseFeedParams = {
  q: string
  page: number
  // Called when a like reveals the session is gone (a 401), so the page can
  // stop claiming the person is logged in.
  onUnauthorized: () => void
}

export type Feed = {
  posts: FeedPost[]
  pagination?: PostCollection['pagination']
  loading: boolean
  error?: string
  pendingSlug: string | null
  toggleLike: (slug: string) => void
}

// The result is stored together with the query it belongs to, so `loading` is
// derived during render rather than set from inside the effect. That avoids a
// cascading render and, more usefully, means the previous page's posts are
// never shown as if they were the new query's results.
type FeedResult = {
  key: string
  collection?: PostCollection
  error?: string
}

// Lives in src/pages/ because components/ may never import src/api/. The
// page owns the data and passes it down as props.
//
// No refetch is needed when the session resolves: the request already carries
// the session cookie, so the API computes likedByMe correctly whether or not
// the client has finished its own probe.
export function useFeed({ q, page, onUnauthorized }: UseFeedParams): Feed {
  const key = `${q}|${page}`
  const [result, setResult] = useState<FeedResult>()
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string>()
  // A ref, not just the pendingSlug state: two toggleLike() calls in the same
  // event (a fast double click) both run before React commits the state
  // update, so a state-only guard would let both through. The ref is read
  // and written synchronously.
  const pendingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    listPosts({ q: q || undefined, page }, controller.signal)
      .then((collection) => setResult({ key, collection }))
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, error: getErrorMessage(fetchError) })
      })

    return () => controller.abort()
  }, [q, page, key])

  const current = result?.key === key ? result : undefined
  const collection = current?.collection

  const toggleLike = useCallback(
    (slug: string) => {
      const post = collection?.data.find((candidate) => candidate.slug === slug)
      if (!post || pendingRef.current) return
      pendingRef.current = true

      const liked = post.likedByMe
      const apply = (value: boolean) => {
        setResult((previous) =>
          previous?.collection
            ? {
                ...previous,
                collection: {
                  ...previous.collection,
                  data: previous.collection.data.map((candidate) =>
                    candidate.slug === slug
                      ? {
                          ...candidate,
                          likedByMe: value,
                          // The delta is always exactly one and both endpoints
                          // are idempotent, so this is provably right without
                          // refetching.
                          likeCount: candidate.likeCount + (value ? 1 : -1),
                        }
                      : candidate,
                  ),
                },
              }
            : previous,
        )
      }

      apply(!liked)
      setPendingSlug(slug)
      setActionError(undefined)

      const request = liked ? unlikePost(slug) : likePost(slug)
      request
        .catch((likeError: unknown) => {
          // Roll the optimistic change back, then explain it.
          apply(liked)
          if (isUnauthorized(likeError)) {
            onUnauthorized()
            setActionError('Sua sessão expirou. Entre novamente para curtir.')
            return
          }
          setActionError(getErrorMessage(likeError))
        })
        .finally(() => {
          pendingRef.current = false
          setPendingSlug(null)
        })
    },
    [collection, onUnauthorized],
  )

  return {
    posts: collection?.data ?? [],
    pagination: collection?.pagination,
    loading: current === undefined,
    error: actionError ?? current?.error,
    pendingSlug,
    toggleLike,
  }
}
