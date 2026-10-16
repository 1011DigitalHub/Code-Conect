import { useEffect } from 'react'

export const SITE_NAME = 'Code Connect'

export type PageMetaOptions = {
  // Search engines should not index this page (e.g. 404, transient flows).
  noindex?: boolean
}

// Names and describes the page (WCAG 2.4.2 Page Titled, SEO meta description):
// title "<page> | Code Connect" and a unique description (50-160 chars, pt-BR).
// index.html keeps the bare site name and a default description before the app loads.
export function usePageMeta(page: string, description: string, options?: PageMetaOptions) {
  useEffect(() => {
    document.title = `${page} | ${SITE_NAME}`

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.append(meta)
    }
    meta.content = description

    let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (options?.noindex) {
      if (!robotsMeta) {
        robotsMeta = document.createElement('meta')
        robotsMeta.name = 'robots'
        document.head.append(robotsMeta)
      }
      robotsMeta.content = 'noindex, nofollow'
    } else if (robotsMeta) {
      robotsMeta.remove()
    }
  }, [page, description, options?.noindex])
}
