import { useState } from 'react'
import { useNavigate } from 'react-router'
import { login } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { saveToken } from '../../api/tokenStorage'
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
      const { accessToken } = await login({ email: values.email, password: values.password })
      saveToken(accessToken, values.remember)
    } catch {
      // The account exists; only the automatic sign-in failed.
      await navigate('/login')
      return
    }
    await navigate('/perfil')
  }

  function handleSocialSignUp(providerId: string) {
    console.info('social sign up', providerId)
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
      <SocialLogin providers={socialProviders} onSelect={handleSocialSignUp} />
    </AuthTemplate>
  )
}
