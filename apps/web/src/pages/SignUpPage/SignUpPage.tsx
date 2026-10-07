import { useState } from 'react'
import { useNavigate } from 'react-router'
import { login } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { createUser } from '../../api/users'
import { AuthFooter } from '../../components/organisms/AuthFooter'
import { SignUpForm, type SignUpFormValues } from '../../components/organisms/SignUpForm'
import { SocialLogin } from '../../components/organisms/SocialLogin'
import { AuthTemplate } from '../../components/templates/AuthTemplate'
import { socialProviders } from '../socialProviders'
import { usePageMeta } from '../usePageMeta'

export function SignUpPage() {
  usePageMeta(
    'Cadastro',
    'Crie sua conta no Code Connect e participe da comunidade de pessoas desenvolvedoras que compartilham código.',
  )

  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  // Creates the account and signs in with the same credentials.
  async function handleSignUp(values: SignUpFormValues) {
    setSubmitting(true)
    setError(undefined)
    try {
      await createUser({ name: values.name, email: values.email, password: values.password })
    } catch (signUpError) {
      setError(getErrorMessage(signUpError))
      setSubmitting(false)
      return
    }

    try {
      // The server sets the session cookie on this response; there is
      // nothing left for the client to store.
      await login({
        email: values.email,
        password: values.password,
        remember: values.remember,
      })
    } catch {
      // The account exists; only the automatic sign-in failed.
      await navigate('/login')
      return
    }
    await navigate('/perfil')
  }

  return (
    <AuthTemplate
      bannerSrc="/Banner_cadastro_page.webp"
      bannerAlt="Pessoa programando em frente a telas com código"
      bannerFocus="center-right"
      title="Cadastro"
      subtitle="Olá! Preencha seus dados."
      footer={
        <AuthFooter
          question="Já tem conta?"
          linkLabel="Faça seu login!"
          href="/login"
          icon="login"
          layout="inline"
        />
      }
    >
      <SignUpForm onSubmit={handleSignUp} submitting={submitting} error={error} />
      {/* Social login isn't implemented yet — see plan/LoginSocial.md for the OIDC design. */}
      <SocialLogin providers={socialProviders} disabled />
    </AuthTemplate>
  )
}
