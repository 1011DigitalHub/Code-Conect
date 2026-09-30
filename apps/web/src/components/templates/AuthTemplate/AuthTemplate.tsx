import type { ReactNode } from 'react'
import { Heading } from '../../atoms/Heading'

export type AuthTemplateProps = {
  bannerSrc: string
  bannerAlt: string
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

// Shared layout for the auth pages (login, sign-up): banner on the left,
// title and page-specific content on the right.
export function AuthTemplate({
  bannerSrc,
  bannerAlt,
  title,
  subtitle,
  children,
  footer,
}: AuthTemplateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="flex w-full max-w-5xl gap-12 rounded-4xl bg-surface p-6 md:p-14">
        <img
          src={bannerSrc}
          alt={bannerAlt}
          className="hidden w-5/12 shrink-0 rounded-sm object-cover md:block"
        />
        <div className="flex flex-1 flex-col gap-8">
          <header className="flex flex-col gap-6">
            <Heading level={1}>{title}</Heading>
            <Heading level={2}>{subtitle}</Heading>
          </header>
          {children}
          {footer && <footer>{footer}</footer>}
        </div>
      </div>
    </main>
  )
}
