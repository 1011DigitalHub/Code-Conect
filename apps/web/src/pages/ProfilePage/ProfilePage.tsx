import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { getMe, logout } from '../../api/auth'
import { getErrorMessage, isUnauthorized } from '../../api/errors'
import type { User } from '../../api/types'
import { FormError } from '../../components/atoms/FormError'
import { ProfileCard } from '../../components/organisms/ProfileCard'
import { CenteredTemplate } from '../../components/templates/CenteredTemplate'
import { usePageMeta } from '../usePageMeta'

type SessionStatus = 'loading' | 'authenticated' | 'anonymous'

// Private page. The session lives in an httpOnly cookie, invisible to JS, so
// there is no synchronous "is there a token" check to gate the render on
// anymore: every visit optimistically probes GET /auth/me and renders a
// loading status (role="status", already covered by the a11y suite) while
// it waits. A 401 means there is no valid session — redirect to login. Any
// other failure keeps the page up with an error, so a flaky network request
// doesn't bounce a logged-in person out.
export function ProfilePage() {
  usePageMeta(
    'Perfil',
    'Veja os dados da sua conta no Code Connect e gerencie sua sessão na comunidade de pessoas desenvolvedoras.',
  )

  const navigate = useNavigate()
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [user, setUser] = useState<User>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    getMe(controller.signal)
      .then((fetchedUser) => {
        setUser(fetchedUser)
        setStatus('authenticated')
      })
      .catch((meError: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(meError)) {
          setStatus('anonymous')
          return
        }
        setError(getErrorMessage(meError))
      })

    return () => controller.abort()
  }, [])

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // Best-effort: even if the request fails, the short-lived session
      // cookie bounds the exposure, so still send the person to login.
    }
    void navigate('/login')
  }

  if (status === 'anonymous') {
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
