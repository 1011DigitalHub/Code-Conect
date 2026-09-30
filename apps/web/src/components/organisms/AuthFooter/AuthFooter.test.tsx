import { render, screen } from '@testing-library/react'
import { AuthFooter } from './AuthFooter'

describe('AuthFooter', () => {
  it('renders the question and a link to the other auth page', () => {
    render(
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
})
