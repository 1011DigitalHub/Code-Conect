import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../test/renderWithRouter'
import { SignUpPage } from './SignUpPage'
import { expectNoA11yViolations } from '../../test/axe'

describe('SignUpPage', () => {
  it('renders the sign-up form, social providers and login link', () => {
    renderWithRouter(<SignUpPage />)

    expect(document.title).toBe('Cadastro | Code Connect')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Crie sua conta no Code Connect'),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pessoa programando/ })).toHaveAttribute(
      'src',
      '/Banner_cadastro_page.webp',
    )
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Github' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gmail' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Faça seu login!' })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<SignUpPage />)

    await expectNoA11yViolations(container)
  })
})
