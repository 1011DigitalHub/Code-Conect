import { useParams } from 'react-router'
import { FormError } from '../../components/atoms/FormError'
import { TextLink } from '../../components/atoms/TextLink'
import { Heading } from '../../components/atoms/Heading'
import { CommentForm } from '../../components/organisms/CommentForm'
import { CommentList } from '../../components/organisms/CommentList'
import { PostArticle } from '../../components/organisms/PostArticle'
import { FeedTemplate } from '../../components/templates/FeedTemplate'
import { usePageMeta } from '../usePageMeta'
import { usePostDetail } from '../usePostDetail'
import { useSession } from '../useSession'

const FALLBACK_DESCRIPTION =
  'Leia o post completo no Code Connect, curta o conteúdo e participe da conversa com outras pessoas desenvolvedoras.'

export function PostPage() {
  const { slug = '' } = useParams()
  const session = useSession()
  const detail = usePostDetail({ slug, onUnauthorized: session.forgetSession })

  // The excerpt is constrained to 50-160 characters by the API, so it is
  // always a valid meta description; the slice is belt and braces.
  usePageMeta(
    detail.post?.title ?? 'Post',
    (detail.post?.excerpt ?? FALLBACK_DESCRIPTION).slice(0, 160),
  )

  return (
    <FeedTemplate
      // No title: the post's own title is the h1, rendered by PostArticle.
      authenticated={session.isAuthenticated}
      onSignOut={() => void session.signOut()}
    >
      {detail.notFound ? (
        <div className="flex flex-col gap-4">
          <Heading level={1}>Post não encontrado</Heading>
          <p className="text-paragraph-sm text-muted">
            O post que você procura não existe ou foi removido.
          </p>
          <TextLink href="/" variant="primary">
            Voltar para o feed
          </TextLink>
        </div>
      ) : detail.loading ? (
        <>
          <Heading level={1}>Carregando...</Heading>
          <p role="status" className="text-paragraph-sm text-muted">
            Carregando o post...
          </p>
        </>
      ) : detail.post ? (
        <>
          <FormError message={detail.error} />

          <PostArticle
            post={detail.post}
            authenticated={session.isAuthenticated}
            pending={detail.likePending}
            onToggleLike={detail.toggleLike}
          />

          <CommentList comments={detail.comments} />

          <CommentForm
            authenticated={session.isAuthenticated}
            pending={detail.commentPending}
            error={detail.commentError}
            onSubmit={detail.submitComment}
          />
        </>
      ) : (
        <>
          <Heading level={1}>Post</Heading>
          <FormError message={detail.error} />
        </>
      )}
    </FeedTemplate>
  )
}
