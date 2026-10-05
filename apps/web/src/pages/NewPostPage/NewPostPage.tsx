import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { createPost } from '../../api/posts'
import { getErrorMessage, isUnauthorized } from '../../api/errors'
import {
  CreatePostForm,
  type CreatePostValues,
} from '../../components/organisms/CreatePostForm'
import { FeedTemplate } from '../../components/templates/FeedTemplate'
import { usePageMeta } from '../usePageMeta'
import { useSession } from '../useSession'

// Private page. The session is an httpOnly cookie, so there is no
// synchronous check to gate the render on: the page waits for the probe and
// only then redirects, exactly as ProfilePage does.
export function NewPostPage() {
  usePageMeta(
    'Novo post',
    'Publique um post no Code Connect com título, resumo, conteúdo e imagem de capa para compartilhar seu projeto com a comunidade.',
  )

  const navigate = useNavigate()
  const session = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  function handleSubmit(values: CreatePostValues) {
    setPending(true)
    setError(undefined)

    createPost(values)
      .then((created) => {
        void navigate(`/posts/${created.slug}`)
      })
      .catch((submitError: unknown) => {
        if (isUnauthorized(submitError)) {
          session.forgetSession()
          void navigate('/login')
          return
        }
        setError(getErrorMessage(submitError))
      })
      .finally(() => setPending(false))
  }

  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  return (
    <FeedTemplate
      title="Novo post"
      authenticated={session.isAuthenticated}
      onSignOut={() => void session.signOut()}
    >
      {session.status === 'loading' ? (
        <p role="status" className="text-paragraph-sm text-muted">
          Carregando...
        </p>
      ) : (
        <CreatePostForm pending={pending} error={error} onSubmit={handleSubmit} />
      )}
    </FeedTemplate>
  )
}
