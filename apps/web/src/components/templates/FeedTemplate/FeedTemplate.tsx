import type { ReactNode } from 'react'
import { Heading } from '../../atoms/Heading'
import { Sidebar } from '../../organisms/Sidebar'

export type FeedTemplateProps = {
  // The page's h1. Omitted by the post page, whose h1 is the post title
  // itself (rendered by PostArticle), which is what the SEO suite wants.
  title?: string
  authenticated: boolean
  onSignOut: () => void
  children: ReactNode
}

// Shared shell for the feed and the single-post page: the side menu (and so
// the Login/Sair switch), the main landmark and the content column.
//
// It holds layout only. Each page keeps its own data fetching, page metadata
// and loading, error and empty states.
export function FeedTemplate({
  title,
  authenticated,
  onSignOut,
  children,
}: FeedTemplateProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar authenticated={authenticated} onSignOut={onSignOut} />

      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {title && <Heading level={1}>{title}</Heading>}
          {children}
        </div>
      </main>
    </div>
  )
}
