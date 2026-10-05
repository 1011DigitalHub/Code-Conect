import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { getMe } from '../../api/auth'
import { getErrorMessage, isUnauthorized } from '../../api/errors'
import { clearToken, getToken } from '../../api/tokenStorage'
import type { User } from '../../api/types'
import { FormError } from '../../components/atoms/FormError'
import { ProfileCard } from '../../components/organisms/ProfileCard'
import { CenteredTemplate } from '../../components/templates/CenteredTemplate'
import { usePageMeta } from '../usePageMeta'

// Private page: without a token it goes straight to the login. With one, it loads the
// logged-in user from GET /auth/me; a 401 means the token expired, so it is dropped.
export function ProfilePage() {
  usePageMeta(
    'Perfil',
    'Veja os dados da sua conta no Code Connect e gerencie sua sessão na comunidade de pessoas desenvolvedoras.',
  )

  const navigate = useNavigate()
  const hasToken = getToken() !== null
  const [user, setUser] = useState<User>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!hasToken) return

    const controller = new AbortController()
    getMe(controller.signal)
      .then(setUser)
      .catch((meError: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(meError)) {
          clearToken()
          void navigate('/login', { replace: true })
          return
        }
        setError(getErrorMessage(meError))
      })

    return () => controller.abort()
  }, [hasToken, navigate])

  function handleLogout() {
    clearToken()
    void navigate('/login')
  }

  if (!hasToken) {
    return <Navigate to="/login" replace />
  }

  return (
    <CenteredTemplate title="Perfil">
      {user ? (
        <ProfileCard user={user} onLogout={handleLogout} />
      ) : error ? (
        <FormError message={error} />
      ) : (
        <p role="status" className="text-paragraph-sm text-muted">
          Carregando...
        </p>
      )}
    </CenteredTemplate>
  )
}
