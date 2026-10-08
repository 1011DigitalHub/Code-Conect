import { TextLink } from '../../components/atoms/TextLink'
import { CenteredTemplate } from '../../components/templates/CenteredTemplate'
import { usePageMeta } from '../usePageMeta'

// Catch-all for `path="*"`. Without it an unknown address — or a post slug that
// no longer exists — rendered a blank screen with no title and no way back.
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
