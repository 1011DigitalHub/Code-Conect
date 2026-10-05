import { TextLink } from '../../atoms/TextLink'

export type PaginationProps = {
  page: number
  totalPages: number
  // Builds the href for a page, so the current page lives in the URL.
  buildHref: (page: number) => string
}

// Links rather than buttons: the current page belongs in the URL, so a result
// page is shareable and the browser Back button behaves as expected.
export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <TextLink href={buildHref(page - 1)} rel="prev">
          Página anterior
        </TextLink>
      ) : (
        <span />
      )}

      <p className="text-paragraph-sm text-muted">
        Página {page} de {totalPages}
      </p>

      {page < totalPages ? (
        <TextLink href={buildHref(page + 1)} rel="next">
          Próxima página
        </TextLink>
      ) : (
        <span />
      )}
    </nav>
  )
}
