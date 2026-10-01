import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../test/renderWithRouter'
import { LoginPage } from './LoginPage'
import { expectNoA11yViolations } from '../../test/axe'

describe('LoginPage', () => {
  it('renders the login form, social providers and sign-up link', () => {
    renderWithRouter(<LoginPage />)

    expect(document.title).toBe('Login | Code Connect')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Entre no Code Connect'),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email ou usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Github' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gmail' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Github' }).querySelector('img')).toHaveAttribute(
      'src',
      '/Github-img.png',
    )
    expect(screen.getByRole('button', { name: 'Gmail' }).querySelector('img')).toHaveAttribute(
      'src',
      '/Gmail-img.png',
    )
    expect(screen.getByRole('link', { name: 'Crie seu cadastro!' })).toHaveAttribute(
      'href',
      '/cadastro',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<LoginPage />)

    await expectNoA11yViolations(container)
  })
})
