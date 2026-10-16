import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { login, startOidcLogin } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { AuthFooter } from '../../components/organisms/AuthFooter'
import { LoginForm, type LoginFormValues } from '../../components/organisms/LoginForm'
import { SocialLogin } from '../../components/organisms/SocialLogin'
import { AuthTemplate } from '../../components/templates/AuthTemplate'
import { socialProviders } from '../socialProviders'
import { usePageMeta } from '../usePageMeta'

// ?oidcError=1 — generic social login failure (expired flow, bad signature,
// user cancelled, …). See OidcController.callback. Deliberately generic:
// the API never says which check failed (WCAG 3.3.1).
const OIDC_ERROR_MESSAGE = 'Não foi possível entrar com o provedor. Tente novamente.'

// ?oidcError=1&oidcRace=1 — state mismatch: two browser tabs raced for the
// same OIDC flow cookie. Different from the generic oidcError so the person
// knows what actually happened and how to fix it.
const OIDC_RACE_MESSAGE =
  'O login social foi aberto em outra aba ao mesmo tempo. Feche as outras abas e tente novamente.'

// ?error=too_many_requests — OidcThrottleExceptionFilter redirects here when
// the browser OIDC routes are throttled (too many attempts).
const THROTTLE_ERROR_MESSAGE = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'

function getInitialOidcError(params: URLSearchParams): string | undefined {
  if (params.get('oidcRace')) return OIDC_RACE_MESSAGE
  if (params.get('oidcError')) return OIDC_ERROR_MESSAGE
  if (params.get('error') === 'too_many_requests') return THROTTLE_ERROR_MESSAGE
  return undefined
}

export function LoginPage() {
  usePageMeta(
    'Login',
    'Entre no Code Connect e continue trocando conhecimento com a comunidade de pessoas desenvolvedoras.',
  )

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(() => getInitialOidcError(searchParams))

  // Strips OIDC/throttle error params from the address bar once shown, so
  // refreshing or sharing the link doesn't keep re-displaying a stale error.
  // An effect, not a render-phase call: setSearchParams triggers a navigation,
  // which must happen after render. Once the params are gone the guard makes
  // every later re-run a no-op.
  useEffect(() => {
    const hasOidcParam =
      searchParams.has('oidcError') ||
      searchParams.has('oidcRace') ||
      searchParams.get('error') === 'too_many_requests'
    if (!hasOidcParam) return
    setSearchParams(
      (params) => {
        params.delete('oidcError')
        params.delete('oidcRace')
        if (params.get('error') === 'too_many_requests') params.delete('error')
        return params
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  async function handleLogin(values: LoginFormValues) {
    setSubmitting(true)
    setError(undefined)
    try {
      // The server sets the session cookie on this response; there is
      // nothing left for the client to store.
      await login({
        email: values.email,
        password: values.password,
        remember: values.remember,
      })
    } catch (loginError) {
      setError(getErrorMessage(loginError))
      setSubmitting(false)
      return
    }
    await navigate('/perfil')
  }

  return (
    <AuthTemplate
      bannerSrc="/Banner_login_page.webp"
      bannerAlt="Pessoa programando em frente a telas com código"
      title="Login"
      subtitle="Boas-vindas! Faça seu login."
      footer={
        <AuthFooter
          question="Ainda não tem conta?"
          linkLabel="Crie seu cadastro!"
          href="/cadastro"
          icon="clipboard"
        />
      }
    >
      <LoginForm
        onSubmit={handleLogin}
        forgotPasswordHref="/recuperar-senha"
        submitting={submitting}
        error={error}
      />
      <SocialLogin providers={socialProviders} onSelect={startOidcLogin} />
    </AuthTemplate>
  )
}
