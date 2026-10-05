import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionLink } from './SessionLink'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

describe('SessionLink', () => {
  it('offers a login link when there is no session', () => {
    renderWithRouter(<SessionLink authenticated={false} onSignOut={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers a sign-out button when there is a session', async () => {
    const onSignOut = vi.fn()
    renderWithRouter(<SessionLink authenticated onSignOut={onSignOut} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument()
  })

  it('is one focusable control either way, so the tab order does not change', () => {
    const { container, rerender } = renderWithRouter(
      <SessionLink authenticated={false} onSignOut={vi.fn()} />,
    )
    const anonymous = container.querySelectorAll('a[href], button').length

    rerender(<SessionLink authenticated onSignOut={vi.fn()} />)

    expect(container.querySelectorAll('a[href], button')).toHaveLength(anonymous)
  })

  it('has no WCAG 2.2 AA violations signed out', async () => {
    const { container } = renderWithRouter(
      <SessionLink authenticated={false} onSignOut={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations signed in', async () => {
    const { container } = renderWithRouter(
      <SessionLink authenticated onSignOut={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })
})
