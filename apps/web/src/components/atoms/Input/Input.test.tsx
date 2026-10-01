import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Input', () => {
  it('accepts typed text', async () => {
    render(<Input aria-label="Email" />)
    const input = screen.getByRole('textbox', { name: 'Email' })

    await userEvent.type(input, 'usuario123')

    expect(input).toHaveValue('usuario123')
  })

  it('flags itself as invalid', () => {
    render(<Input aria-label="Email" invalid />)

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInvalid()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Input aria-label="Email" invalid />)

    await expectNoA11yViolations(container)
  })
})
