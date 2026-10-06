import { useState } from 'react'
import { useNavigate } from 'react-router'
import { login } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { AuthFooter } from '../../components/organisms/AuthFooter'
import { LoginForm, type LoginFormValues } from '../../components/organisms/LoginForm'
import { SocialLogin } from '../../components/organisms/SocialLogin'
import { AuthTemplate } from '../../components/templates/AuthTemplate'
import { socialProviders } from '../socialProviders'
import { usePageMeta } from '../usePageMeta'

export function LoginPage() {
  usePageMeta(
    'Login',
    'Entre no Code Connect e continue trocando conhecimento com a comunidade de pessoas desenvolvedoras.',
  )

  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

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
      {/* Social login isn't implemented yet — see plan/LoginSocial.md for the OIDC design. */}
      <SocialLogin providers={socialProviders} disabled />
    </AuthTemplate>
  )
}
