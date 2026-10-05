import { useState } from 'react'
import { ThumbnailPlaceholder } from '../../atoms/ThumbnailPlaceholder'

export type PostThumbnailProps = {
  // The API's thumbnailUrl: null when the post has no cover at all.
  src: string | null
  // Required, not optional, so every call site decides explicitly whether
  // the image is decorative ('' beside a titled link) or informative.
  alt: string
  // The page's LCP candidate: fetched with high priority and never lazily.
  priority?: boolean
  // Above the fold but not the LCP: still eager, because loading="lazy" on
  // a visible image can delay the LCP, but at normal priority.
  eager?: boolean
}

// Covers both ways a cover image can be missing:
//   a) thumbnailUrl is null       -> no <img> at all, so no request and no 404
//   b) the URL 404s or won't decode -> onError swaps in the placeholder
// Both branches render the same aspect-video box, so the swap never shifts
// the layout.
export function PostThumbnail({ src, alt, priority, eager }: PostThumbnailProps) {
  // Keyed on the src value rather than a boolean, so the state invalidates
  // itself when src changes — no effect, and no stale fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src === null || failedSrc === src) {
    return <ThumbnailPlaceholder />
  }

  return (
    <img
      src={src}
      alt={alt}
      // Intrinsic size, so the browser reserves the box before the bytes
      // arrive; the classes decide the rendered size.
      width={640}
      height={360}
      decoding="async"
      loading={priority || eager ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      onError={() => setFailedSrc(src)}
      className="aspect-video w-full rounded-2xl object-cover"
    />
  )
}
