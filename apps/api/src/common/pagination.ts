import type { CollectionLinksDto, PaginationDto } from './dto/paginated.dto.js';

export function buildPagination(input: {
  page: number;
  perPage: number;
  total: number;
}): PaginationDto {
  // An empty collection still has one (empty) page, so page 1 is never out
  // of range and `next` is correctly null on it.
  const totalPages = Math.max(1, Math.ceil(input.total / input.perPage));
  return { page: input.page, perPage: input.perPage, total: input.total, totalPages };
}

// Rebuilds the query string with URLSearchParams so a filter like ?q= is
// preserved and encoded on the next/prev links instead of being dropped.
export function buildCollectionLinks(
  basePath: string,
  params: Record<string, string | number | undefined>,
  page: number,
  totalPages: number,
): CollectionLinksDto {
  const href = (target: number): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    search.set('page', String(target));
    return `${basePath}?${search.toString()}`;
  };

  return {
    self: href(page),
    next: page < totalPages ? href(page + 1) : null,
    prev: page > 1 ? href(page - 1) : null,
  };
}
