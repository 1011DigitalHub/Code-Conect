import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { TextLink } from './TextLink'
import { expectNoA11yViolations } from '../../../test/axe'

describe('TextLink', () => {
  it('renders a link to the given href', () => {
    renderWithRouter(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    await expectNoA11yViolations(container)
  })
})
