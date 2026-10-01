import { useEffect } from 'react'

export const SITE_NAME = 'Code Connect'

// Names and describes the page (WCAG 2.4.2 Page Titled, SEO meta description):
// title "<page> | Code Connect" and a unique description (50-160 chars, pt-BR).
// index.html keeps the bare site name and a default description before the app loads.
export function usePageMeta(page: string, description: string) {
  useEffect(() => {
    document.title = `${page} | ${SITE_NAME}`

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.append(meta)
    }
    meta.content = description
  }, [page, description])
}
