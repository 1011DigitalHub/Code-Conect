import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxField } from './CheckboxField'
import { expectNoA11yViolations } from '../../../test/axe'

describe('CheckboxField', () => {
  it('toggles the checkbox when its label is clicked', async () => {
    render(<CheckboxField id="remember" label="Lembrar-me" />)

    await userEvent.click(screen.getByText('Lembrar-me'))

    expect(screen.getByRole('checkbox', { name: 'Lembrar-me' })).toBeChecked()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<CheckboxField id="remember" label="Lembrar-me" />)

    await expectNoA11yViolations(container)
  })
})
