import { TextLink } from '../../components/atoms/TextLink'
import { CenteredTemplate } from '../../components/templates/CenteredTemplate'
import { usePageMeta } from '../usePageMeta'

// Catch-all for `path="*"`: an address that matches no route, such as a stale
// link or a typo in a static path. Without it those rendered a blank screen,
// with no title and no way back.
//
// Not for a post slug that does not exist: that still matches /posts/:slug, and
// PostPage renders its own not-found state from usePostDetail.
export function NotFoundPage() {
  usePageMeta(
    'Página não encontrada',
    'O endereço que você abriu não existe no Code Connect. Volte para o feed para continuar explorando os posts da comunidade.',
  )

  return (
    <CenteredTemplate title="Página não encontrada">
      <p className="text-paragraph-sm text-muted">
        O endereço que você abriu não existe ou foi removido. Verifique o link ou volte para o
        feed.
      </p>
      <TextLink href="/" variant="primary">
        Voltar para o feed
      </TextLink>
    </CenteredTemplate>
  )
}
