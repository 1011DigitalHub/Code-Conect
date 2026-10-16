import { useState } from 'react'
import { ThumbnailPlaceholder } from '../../atoms/ThumbnailPlaceholder'

export type PostThumbnailProps = {
  // The API's thumbnailUrl (or a slug-derived path): null when the post has no cover at all.
  src: string | null
  // Required, not optional, so every call site decides explicitly whether
  // the image is decorative ('' beside a titled link) or informative.
  alt: string
  // Responsive srcset — e.g. "/posts/slug-400.webp 400w, /posts/slug.webp 800w".
  // Convention for slug-based covers: public/posts/<slug>-<width>.webp.
  srcSet?: string
  // The page's LCP candidate: fetched with high priority and never lazily.
  priority?: boolean
  // Above the fold but not the LCP: still eager, because loading="lazy" on
  // a visible image can delay the LCP, but at normal priority.
  eager?: boolean
}

// Covers both ways a cover image can be missing:
//   a) src is null                -> no <img> at all, so no request and no 404
//   b) the URL 404s or won't decode -> onError swaps in the placeholder
// Both branches render the same aspect-video box, so the swap never shifts
// the layout.
export function PostThumbnail({ src, alt, srcSet, priority, eager }: PostThumbnailProps) {
  // Keyed on the src value rather than a boolean, so the state invalidates
  // itself when src changes — no effect, and no stale fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src === null || failedSrc === src) {
    return <ThumbnailPlaceholder />
  }

  return (
    <img
      src={src}
      srcSet={srcSet}
      // Feed grid: 1 col < 768px, 2 cols 768–1279px, 3 cols ≥ 1280px (max-w-5xl container).
      sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
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
