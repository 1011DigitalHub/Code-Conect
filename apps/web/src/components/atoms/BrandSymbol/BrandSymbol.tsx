// Decorative "code connect" chain symbol used in page backgrounds. It fills the width of its
// parent, so the caller decides size and position. The two Figma SVG parts sit at their
// coordinates inside the 407×486 frame.
export function BrandSymbol() {
  return (
    <svg aria-hidden="true" viewBox="0 0 407 486" className="block h-auto w-full">
      <image href="/symbol/symbol-bottom.svg" x="0" y="125.65" width="227.564" height="360.35" />
      <image href="/symbol/symbol-top.svg" x="179.42" y="0" width="227.5" height="360.35" />
    </svg>
  )
}
