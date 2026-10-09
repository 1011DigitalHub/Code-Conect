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

// Deliberately generic: the API never says *which* check failed (an
// expired flow, a bad signature, the person cancelling at the provider, ...)
// behind ?oidcError=1 — see OidcController.callback — only that the social
// login didn't complete, which is already enough to tell the person to try
// again instead of leaving them on /login with no explanation at all
// (WCAG 3.3.1).
const OIDC_ERROR_MESSAGE = 'Não foi possível entrar com o provedor. Tente novamente.'

export function LoginPage() {
  usePageMeta(
    'Login',
    'Entre no Code Connect e continue trocando conhecimento com a comunidade de pessoas desenvolvedoras.',
  )

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(() =>
    searchParams.get('oidcError') ? OIDC_ERROR_MESSAGE : undefined,
  )

  // Strips ?oidcError=1 from the address bar once shown, so refreshing or
  // sharing the link doesn't keep re-displaying a stale error. An effect,
  // not a render-phase call: setSearchParams triggers a navigation, which
  // must happen after render, not while this component is still rendering.
  // Safe to list as a normal dependency-driven effect: once the param is
  // gone, the guard below makes every later re-run a no-op.
  useEffect(() => {
    if (!searchParams.has('oidcError')) return
    setSearchParams(
      (params) => {
        params.delete('oidcError')
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
