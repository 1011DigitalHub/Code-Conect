import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { TextLink } from './TextLink'

describe('TextLink', () => {
  it('renders a link to the given href', () => {
    renderWithRouter(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })
})
