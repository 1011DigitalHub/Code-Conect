import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

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
})
