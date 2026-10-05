import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from './Sidebar'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Sidebar', () => {
  it('is a named navigation landmark', () => {
    renderWithRouter(<Sidebar authenticated={false} onSignOut={vi.fn()} />)

    expect(
      screen.getByRole('navigation', { name: 'Menu principal' }),
    ).toBeInTheDocument()
  })

  it('always offers the feed', () => {
    renderWithRouter(<Sidebar authenticated={false} onSignOut={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Feed' })).toHaveAttribute('href', '/')
  })

  it('marks the feed as the current page when it is', () => {
    renderWithRouter(<Sidebar authenticated={false} onSignOut={vi.fn()} />, {
      route: '/',
    })

    expect(screen.getByRole('link', { name: 'Feed' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('hides the private entries when signed out, and shows Login', () => {
    renderWithRouter(<Sidebar authenticated={false} onSignOut={vi.fn()} />)

    expect(screen.queryByRole('link', { name: 'Novo post' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
  })

  it('shows the private entries and Sair when signed in', async () => {
    const onSignOut = vi.fn()
    renderWithRouter(<Sidebar authenticated onSignOut={onSignOut} />)

    expect(screen.getByRole('link', { name: 'Novo post' })).toHaveAttribute(
      'href',
      '/posts/novo',
    )
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute(
      'href',
      '/perfil',
    )
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('has no WCAG 2.2 AA violations signed out', async () => {
    const { container } = renderWithRouter(
      <Sidebar authenticated={false} onSignOut={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations signed in', async () => {
    const { container } = renderWithRouter(<Sidebar authenticated onSignOut={vi.fn()} />)

    await expectNoA11yViolations(container)
  })
})
