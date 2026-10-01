import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../test/renderWithRouter'
import { SignUpPage } from './SignUpPage'

describe('SignUpPage', () => {
  it('renders the sign-up form, social providers and login link', () => {
    renderWithRouter(<SignUpPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pessoa programando/ })).toHaveAttribute(
      'src',
      '/Banner_cadastro_page.png',
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
})
