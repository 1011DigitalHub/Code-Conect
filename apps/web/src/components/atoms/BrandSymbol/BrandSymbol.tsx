// Decorative "code connect" chain symbol used in page backgrounds. It fills the width of its
// parent, so the caller decides size and position.
export function BrandSymbol() {
  return (
    <div aria-hidden="true" className="relative aspect-[407/486] w-full">
      <span className="absolute inset-[25.85%_44.09%_0_0]">
        <img src="/symbol/symbol-bottom.svg" alt="" className="block size-full" />
      </span>
      <span className="absolute inset-[0_0.02%_25.85%_44.09%]">
        <img src="/symbol/symbol-top.svg" alt="" className="block size-full" />
      </span>
    </div>
  )
}
