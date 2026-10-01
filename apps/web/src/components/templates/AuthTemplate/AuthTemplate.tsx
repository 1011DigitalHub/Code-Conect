import type { ReactNode } from 'react'
import { BrandSymbol } from '../../atoms/BrandSymbol'
import { Heading } from '../../atoms/Heading'
import { Logo } from '../../atoms/Logo'

type BannerFocus = 'center' | 'center-right'

const bannerFocusClasses: Record<BannerFocus, string> = {
  center: 'object-center',
  'center-right': 'object-center-right',
}

export type AuthTemplateProps = {
  bannerSrc: string
  bannerAlt: string
  bannerFocus?: BannerFocus
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

// Shared layout for the auth pages (login, sign-up): banner with the logo next to the
// title and page-specific content on large screens, stacked above it on smaller ones.
export function AuthTemplate({
  bannerSrc,
  bannerAlt,
  bannerFocus = 'center',
  title,
  subtitle,
  children,
  footer,
}: AuthTemplateProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-10 md:p-8">
      <div className="pointer-events-none absolute -top-2 left-1/12 w-1/4 max-w-sm opacity-30">
        <BrandSymbol />
      </div>
      <div className="pointer-events-none absolute right-1/12 bottom-0 w-1/4 max-w-sm opacity-30">
        <BrandSymbol />
      </div>

      <div className="relative flex w-full max-w-2xl flex-col gap-8 rounded-4xl border border-page bg-surface px-4 py-8 md:px-20 md:py-14 lg:max-w-5xl lg:flex-row lg:justify-between lg:gap-4">
        <div className="relative aspect-4/5 overflow-hidden sm:aspect-7/6 lg:aspect-auto lg:w-102">
          {/* The banner is the LCP element: fetch it first. Banners are exported at 1344x896;
              width/height give the intrinsic ratio, the classes set the rendered size. */}
          <img
            src={bannerSrc}
            alt={bannerAlt}
            width={1344}
            height={896}
            fetchPriority="high"
            decoding="async"
            className={`absolute inset-0 size-full object-cover ${bannerFocusClasses[bannerFocus]}`}
          />
          <div className="absolute inset-x-0 bottom-8 flex justify-center">
            <Logo />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:w-102 lg:shrink-0 lg:px-8">
          <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-6">
              <Heading level={1}>{title}</Heading>
              <Heading level={2}>{subtitle}</Heading>
            </header>
            {children}
          </div>
          {footer && <footer>{footer}</footer>}
        </div>
      </div>
    </main>
  )
}
