import { screen } from '@testing-library/react'
import { NavItem } from './NavItem'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

describe('NavItem', () => {
  it('renders a link to its destination', () => {
    renderWithRouter(<NavItem to="/perfil" icon="login" label="Perfil" />)

    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute(
      'href',
      '/perfil',
    )
  })

  it('marks the current page for assistive technology', () => {
    renderWithRouter(<NavItem to="/" icon="comment" label="Feed" current />)

    expect(screen.getByRole('link', { name: 'Feed' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('leaves aria-current off when it is not the current page', () => {
    renderWithRouter(<NavItem to="/perfil" icon="login" label="Perfil" />)

    expect(screen.getByRole('link', { name: 'Perfil' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <NavItem to="/" icon="comment" label="Feed" />,
    )

    await expectNoA11yViolations(container)
  })
})
