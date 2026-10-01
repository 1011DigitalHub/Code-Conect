import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './Checkbox'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Checkbox', () => {
  it('toggles when clicked', async () => {
    render(<Checkbox aria-label="Lembrar-me" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Lembrar-me' })

    await userEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Checkbox aria-label="Lembrar-me" />)

    await expectNoA11yViolations(container)
  })
})
