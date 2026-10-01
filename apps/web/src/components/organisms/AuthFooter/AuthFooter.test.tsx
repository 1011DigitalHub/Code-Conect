import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthFooter } from './AuthFooter'

describe('AuthFooter', () => {
  it('renders the question and a link to the other auth page', () => {
    renderWithRouter(
      <AuthFooter
        question="Ainda não tem conta?"
        linkLabel="Crie seu cadastro!"
        href="/cadastro"
        icon="clipboard"
      />,
    )

    expect(screen.getByText('Ainda não tem conta?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crie seu cadastro!' })).toHaveAttribute(
      'href',
      '/cadastro',
    )
  })

  it('renders the inline layout with the question and the link', () => {
    renderWithRouter(
      <AuthFooter
        question="Já tem conta?"
        linkLabel="Faça seu login!"
        href="/login"
        icon="login"
        layout="inline"
      />,
    )

    expect(screen.getByText('Já tem conta?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Faça seu login!' })).toHaveAttribute('href', '/login')
  })
})
