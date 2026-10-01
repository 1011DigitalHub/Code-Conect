// "code connect" logo, assembled from the three Figma SVG parts. Positions and sizes are the
// Figma coordinates inside the 127.258×40 frame, so the parts never need arbitrary classes.
export function Logo() {
  return (
    <svg
      role="img"
      aria-label="Code Connect"
      viewBox="0 0 127.258 40"
      className="h-10 w-32 shrink-0"
    >
      <image href="/logo/logo-mark-bottom.svg" x="0" y="14.192" width="15.2264" height="23.372" />
      <image href="/logo/logo-mark-top.svg" x="12" y="6.044" width="15.2264" height="23.3683" />
      <image href="/logo/logo-wordmark.svg" x="34.2048" y="0" width="93.0532" height="39.9986" />
    </svg>
  )
}
