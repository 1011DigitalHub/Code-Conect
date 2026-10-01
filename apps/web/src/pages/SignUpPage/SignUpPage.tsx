import { AuthFooter } from '../../components/organisms/AuthFooter'
import { SignUpForm, type SignUpFormValues } from '../../components/organisms/SignUpForm'
import { SocialLogin } from '../../components/organisms/SocialLogin'
import { AuthTemplate } from '../../components/templates/AuthTemplate'
import { socialProviders } from '../socialProviders'

export function SignUpPage() {
  // TODO: call the API once the auth endpoints exist.
  function handleSignUp(values: SignUpFormValues) {
    console.info('sign up', { name: values.name, email: values.email, remember: values.remember })
  }

  function handleSocialSignUp(providerId: string) {
    console.info('social sign up', providerId)
  }

  return (
    <AuthTemplate
      bannerSrc="/Banner_cadastro_page.png"
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
      <SignUpForm onSubmit={handleSignUp} />
      <SocialLogin providers={socialProviders} onSelect={handleSocialSignUp} />
    </AuthTemplate>
  )
}
