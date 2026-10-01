import { useEffect } from 'react'

export const SITE_NAME = 'Code Connect'

// Names the page in the browser tab (WCAG 2.4.2 Page Titled): "<page> | Code Connect".
// index.html keeps the bare site name as the title before the app loads.
export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = `${page} | ${SITE_NAME}`
  }, [page])
}
