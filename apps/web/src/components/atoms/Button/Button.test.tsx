import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Button', () => {
  it('renders its label and calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Login</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to type="button" so it does not submit forms by accident', () => {
    render(<Button>Login</Button>)

    expect(screen.getByRole('button', { name: 'Login' })).toHaveAttribute('type', 'button')
  })

  it('renders the ghost variant for icon-led controls', () => {
    render(
      <Button variant="ghost" aria-label="Curtir">
        4
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Curtir' })).toBeInTheDocument()
  })

  it('forwards aria-pressed, so a toggle can report its state', () => {
    render(
      <Button variant="ghost" aria-pressed aria-label="Curtir">
        4
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Button>Login</Button>)

    await expectNoA11yViolations(container)
  })
})
