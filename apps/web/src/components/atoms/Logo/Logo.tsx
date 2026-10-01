// "code connect" logo, assembled from the three Figma SVG parts at their original positions.
export function Logo() {
  return (
    <div role="img" aria-label="Code Connect" className="relative h-10 w-[127.258px] shrink-0">
      <span className="absolute inset-[35.48%_88.04%_6.09%_0]">
        <img src="/logo/logo-mark-bottom.svg" alt="" className="block size-full" />
      </span>
      <span className="absolute inset-[15.11%_78.6%_26.47%_9.43%]">
        <img src="/logo/logo-mark-top.svg" alt="" className="block size-full" />
      </span>
      <span className="absolute inset-[0_0_0_26.88%]">
        <img src="/logo/logo-wordmark.svg" alt="" className="block size-full" />
      </span>
    </div>
  )
}
