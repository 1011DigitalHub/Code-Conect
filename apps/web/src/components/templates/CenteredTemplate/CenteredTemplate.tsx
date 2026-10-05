import type { ReactNode } from 'react'
import { Heading } from '../../atoms/Heading'

export type CenteredTemplateProps = {
  title: string
  children: ReactNode
}

// Layout for simple logged-in pages: one card centered on the screen, no banner.
export function CenteredTemplate({ title, children }: CenteredTemplateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-3 py-10 md:p-8">
      <div className="flex w-full max-w-md flex-col gap-8 rounded-4xl border border-page bg-surface px-4 py-8 md:px-12 md:py-12">
        <Heading level={1}>{title}</Heading>
        {children}
      </div>
    </main>
  )
}
