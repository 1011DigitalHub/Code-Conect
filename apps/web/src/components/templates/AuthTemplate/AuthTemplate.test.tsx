import { render, screen } from '@testing-library/react'
import { AuthTemplate } from './AuthTemplate'
import { expectNoA11yViolations } from '../../../test/axe'

describe('AuthTemplate', () => {
  it('renders the banner with the logo, title, subtitle, content and footer', () => {
    render(
      <AuthTemplate
        bannerSrc="/Banner_login_page.webp"
        bannerAlt="Pessoa programando"
        title="Login"
        subtitle="Boas-vindas! Faça seu login."
        footer={<p>Rodapé</p>}
      >
        <p>Conteúdo</p>
      </AuthTemplate>,
    )

    expect(screen.getByRole('img', { name: 'Pessoa programando' })).toHaveAttribute(
      'src',
      '/Banner_login_page.webp',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Boas-vindas! Faça seu login.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Conteúdo')).toBeInTheDocument()
    expect(screen.getByText('Rodapé')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Code Connect' })).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <AuthTemplate
        bannerSrc="/Banner_login_page.webp"
        bannerAlt="Pessoa programando"
        title="Login"
        subtitle="Boas-vindas! Faça seu login."
        footer={<p>Rodapé</p>}
      >
        <p>Conteúdo</p>
      </AuthTemplate>,
    )

    await expectNoA11yViolations(container)
  })
})
