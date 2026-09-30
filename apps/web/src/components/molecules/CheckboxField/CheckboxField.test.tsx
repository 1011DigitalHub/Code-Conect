import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxField } from './CheckboxField'

describe('CheckboxField', () => {
  it('toggles the checkbox when its label is clicked', async () => {
    render(<CheckboxField id="remember" label="Lembrar-me" />)

    await userEvent.click(screen.getByText('Lembrar-me'))

    expect(screen.getByRole('checkbox', { name: 'Lembrar-me' })).toBeChecked()
  })
})
