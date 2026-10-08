import { useSearchParams } from 'react-router'
import { FormError } from '../../components/atoms/FormError'
import { SearchField } from '../../components/molecules/SearchField'
import { Pagination } from '../../components/organisms/Pagination'
import { PostList } from '../../components/organisms/PostList'
import { FeedTemplate } from '../../components/templates/FeedTemplate'
import { usePageMeta } from '../usePageMeta'
import { useFeed } from '../useFeed'
import { useSession } from '../useSession'

// The search term and the page live in the URL, so a result is shareable and
// the browser's Back button works.
function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function FeedPage() {
  usePageMeta(
    'Feed',
    'Veja os posts da comunidade Code Connect, busque por tema e acompanhe os projetos compartilhados por pessoas desenvolvedoras.',
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const page = readPage(searchParams.get('page'))

  const session = useSession()
  const feed = useFeed({ q, page, onUnauthorized: session.forgetSession })

  function handleSearch(term: string) {
    const next = new URLSearchParams()
    if (term) next.set('q', term)
    // A new search always starts from the first page.
    setSearchParams(next)
  }

  function buildHref(target: number): string {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (target > 1) next.set('page', String(target))
    const search = next.toString()
    return search ? `/?${search}` : '/'
  }

  const total = feed.pagination?.total ?? 0

  // Rendered from the first paint with empty text and only filled in later:
  // a live region that enters the DOM together with its content often is not
  // announced at all. It lives here, not in SearchField, because the result
  // count is page-level information.
  const announcement = feed.loading
    ? ''
    : q
      ? total === 0
        ? `Nenhum post encontrado para “${q}”.`
        : `${total} ${total === 1 ? 'post encontrado' : 'posts encontrados'} para “${q}”.`
      : ''

  return (
    <FeedTemplate
      title="Feed"
      authenticated={session.isAuthenticated}
      onSignOut={() => void session.signOut()}
    >
      <SearchField
        id="feed-search"
        label="Buscar posts"
        defaultValue={q}
        onSubmit={handleSearch}
      />

      <p role="status" aria-live="polite" className="text-paragraph-sm text-muted">
        {announcement}
      </p>

      <FormError message={feed.error} />

      {feed.loading ? (
        <p role="status" className="text-paragraph-sm text-muted">
          Carregando...
        </p>
      ) : feed.posts.length === 0 ? (
        <p className="text-paragraph-sm text-muted">
          {q
            ? 'Tente outro termo ou limpe a busca para ver todos os posts.'
            : 'Ainda não há posts por aqui.'}
        </p>
      ) : (
        <>
          <PostList
            posts={feed.posts}
            authenticated={session.isAuthenticated}
            pendingSlug={feed.pendingSlug}
            onToggleLike={feed.toggleLike}
          />
          <Pagination
            page={page}
            totalPages={feed.pagination?.totalPages ?? 1}
            buildHref={buildHref}
          />
        </>
      )}
    </FeedTemplate>
  )
}
