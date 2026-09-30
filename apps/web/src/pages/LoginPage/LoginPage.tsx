import { AuthFooter } from '../../components/organisms/AuthFooter'
import { LoginForm, type LoginFormValues } from '../../components/organisms/LoginForm'
import { SocialLogin, type SocialProvider } from '../../components/organisms/SocialLogin'
import { AuthTemplate } from '../../components/templates/AuthTemplate'

const socialProviders: SocialProvider[] = [
  { id: 'github', name: 'Github', icon: '/Github-img.png' },
  { id: 'google', name: 'Gmail', icon: '/Gmail-img.png' },
]

export function LoginPage() {
  // TODO: call the API once the auth endpoints exist.
  function handleLogin(values: LoginFormValues) {
    console.info('login', { login: values.login, remember: values.remember })
  }

  function handleSocialLogin(providerId: string) {
    console.info('social login', providerId)
  }

  return (
    <AuthTemplate
      bannerSrc="/Banner_login_page.png"
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
      <LoginForm onSubmit={handleLogin} forgotPasswordHref="/recuperar-senha" />
      <SocialLogin providers={socialProviders} onSelect={handleSocialLogin} />
    </AuthTemplate>
  )
}
