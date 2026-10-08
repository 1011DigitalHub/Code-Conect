// Shown when a post has no usable cover image. Inline SVG on purpose: no
// network request (so a missing cover never costs a round trip) and the
// viewBox gives it an intrinsic 16:9 ratio, so it reserves exactly the same
// box as a real thumbnail and contributes nothing to CLS.
//
// Decorative, so aria-hidden: the post title sits right beside it, and
// announcing "imagem não disponível" once per card would be pure noise.
export function ThumbnailPlaceholder() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 640 360"
      className="aspect-video w-full rounded-2xl bg-surface text-muted"
    >
      <g fill="none" stroke="currentColor" strokeWidth="8" opacity="0.4">
        <rect x="236" y="130" width="168" height="120" rx="12" />
        <circle cx="282" cy="172" r="14" />
        <path d="m248 238 44-44 34 34 26-26 40 40" strokeLinecap="round" />
      </g>
    </svg>
  )
}
