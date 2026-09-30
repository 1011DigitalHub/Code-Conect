import { render, screen } from '@testing-library/react'
import { TextLink } from './TextLink'

describe('TextLink', () => {
  it('renders a link to the given href', () => {
    render(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })
})
