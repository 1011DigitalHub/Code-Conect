import { render, screen } from '@testing-library/react'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('renders the login form, social providers and sign-up link', () => {
    render(<LoginPage />)

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
})
